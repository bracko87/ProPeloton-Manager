CREATE OR REPLACE FUNCTION public.race_team_stage_disqualification_penalty_trg_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- Race Jersey shortages are no longer disqualifications and must never trigger
  -- missed-start/no-show economy penalties.
  if new.reason_code='mandatory_race_jersey_shortage' then return new; end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_unapplied_prestart_disqualification_penalties_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  return jsonb_build_object(
    'status','completed','applied',0,'failed',0,'results','[]'::jsonb,
    'rule','race_jersey_shortages_no_longer_create_prestart_disqualification_penalties',
    'ran_at',now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_scan_all_sport_director_race_eligibility_v1(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_scan_all_mechanic_race_eligibility_v1(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_apply_phase9_supplies_v1(p_simulation_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_stage_date date;
  v_original_input jsonb;
  v_original_result jsonb;
  v_temp_input jsonb;
  v_temp_result jsonb;
  v_manifest jsonb;
  v_updates jsonb := '[]'::jsonb;
  v_item jsonb;
  v_source_resource_id text;
  v_applied_resource_id text;
  v_resource_kind text;
  v_supply_key text;
  v_club_id uuid;
  v_selected_unit_id uuid;
  v_selected_remaining integer;
  v_selected_last_used date;
  v_uses_needed integer;
  v_alt_unit_id uuid;
  v_existing_applied_resource_id text;
  v_existing_skip boolean;
  v_existing_skip_reason text;
  v_source_input jsonb;
  v_used_alt_ids uuid[] := array[]::uuid[];
  v_remaps jsonb := '[]'::jsonb;
  v_skips jsonb := '[]'::jsonb;
  v_result jsonb;
  v_changed boolean := false;
  v_skip boolean := false;
  v_reason text;
  v_map jsonb;
begin
  if p_simulation_run_id is null then
    raise exception 'p_simulation_run_id is required';
  end if;

  select * into v_run
  from public.race_stage_simulation_runs r
  where r.id = p_simulation_run_id
  for update;

  if not found then
    raise exception 'Unknown simulation run %', p_simulation_run_id;
  end if;

  if exists (
    select 1 from public.race_stage_authoritative_runs a
    where a.simulation_run_id = p_simulation_run_id
  ) then
    return public.universal_race_stage_apply_phase9_supplies_exact_v1(p_simulation_run_id);
  end if;

  select s.stage_date::date into v_stage_date
  from public.race_stages s
  where s.id = v_run.stage_id;

  v_original_input := coalesce(v_run.input_snapshot_json, '{}'::jsonb);
  v_original_result := coalesce(v_run.result_summary_json, '{}'::jsonb);
  v_temp_input := v_original_input;
  v_temp_result := v_original_result;
  v_manifest := coalesce(v_original_result -> 'application_manifest', '{}'::jsonb);

  for v_item in
    select item
    from jsonb_array_elements(coalesce(v_manifest -> 'phase9ResourceUpdates', '[]'::jsonb)) item
  loop
    v_source_resource_id := coalesce(v_item ->> 'resourceId', '');
    v_applied_resource_id := v_source_resource_id;
    v_skip := false;
    v_reason := null;
    v_alt_unit_id := null;
    v_existing_applied_resource_id := null;
    v_existing_skip := false;
    v_existing_skip_reason := null;

    v_resource_kind := coalesce(
      v_original_input #>> array['preparation','raceSupplies',v_source_resource_id,'resourceKind'],
      ''
    );

    if v_resource_kind = 'durable_supply_unit'
       and v_source_resource_id like 'durable:%'
    then
      v_supply_key := coalesce(
        v_original_input #>> array['preparation','raceSupplies',v_source_resource_id,'supplyKey'],
        ''
      );
      v_club_id := nullif(v_item ->> 'teamId', '')::uuid;
      v_uses_needed := greatest(coalesce(nullif(v_item ->> 'stageUsesUsed', '')::integer, 0), 0);
      v_selected_unit_id := replace(v_source_resource_id, 'durable:', '')::uuid;

      select
        a.resource_id,
        coalesce((a.metadata ->> 'physical_application_skipped')::boolean, false),
        a.metadata ->> 'physical_application_skip_reason'
      into
        v_existing_applied_resource_id,
        v_existing_skip,
        v_existing_skip_reason
      from public.race_engine_stage_supply_applications a
      where a.simulation_run_id = p_simulation_run_id
        and (
          a.metadata ->> 'manifest_resource_id' = v_source_resource_id
          or a.resource_id = v_source_resource_id
        )
      order by a.created_at, a.id
      limit 1;

      if v_existing_applied_resource_id is not null then
        if v_existing_skip then
          v_skip := true;
          v_reason := coalesce(v_existing_skip_reason, 'existing_physical_shortage_skip');
        else
          v_applied_resource_id := v_existing_applied_resource_id;
          v_alt_unit_id := replace(v_applied_resource_id, 'durable:', '')::uuid;
          v_reason := 'existing_rebound';
        end if;
      else
        select u.stage_uses_remaining, u.last_used_game_date
        into v_selected_remaining, v_selected_last_used
        from public.club_race_supply_units u
        where u.id = v_selected_unit_id
          and u.club_id = v_club_id
          and u.supply_key = v_supply_key;

        if not found then
          v_reason := 'selected_unit_missing_at_publication';
        elsif v_uses_needed > 0 and v_selected_last_used = v_stage_date then
          v_reason := 'selected_unit_already_used_same_game_date';
        elsif v_uses_needed > 0 and v_selected_remaining < v_uses_needed then
          v_reason := 'selected_unit_insufficient_remaining_uses';
        end if;

        if v_reason is not null and v_uses_needed > 0 then
          select alt.id
          into v_alt_unit_id
          from public.club_race_supply_units alt
          where alt.club_id = v_club_id
            and alt.supply_key = v_supply_key
            and alt.status in ('ready','assigned')
            and alt.stage_uses_remaining >= v_uses_needed
            and (alt.last_used_game_date is null or alt.last_used_game_date < v_stage_date)
            and not (alt.id = any(v_used_alt_ids))
            and not exists (
              select 1
              from jsonb_array_elements(coalesce(v_manifest -> 'phase9ResourceUpdates', '[]'::jsonb)) mi
              where mi ->> 'resourceId' = 'durable:' || alt.id::text
            )
            and not exists (
              select 1
              from public.race_engine_stage_supply_applications a
              where a.simulation_run_id = p_simulation_run_id
                and a.resource_id = 'durable:' || alt.id::text
            )
          order by alt.stage_uses_remaining, alt.created_at, alt.id
          limit 1;

          if v_alt_unit_id is not null then
            v_applied_resource_id := 'durable:' || v_alt_unit_id::text;
          else
            v_skip := true;
          end if;
        end if;
      end if;

      if v_skip then
        v_changed := true;
        v_skips := v_skips || jsonb_build_array(jsonb_build_object(
          'manifest_resource_id', v_source_resource_id,
          'club_id', v_club_id,
          'supply_key', v_supply_key,
          'stage_date', v_stage_date,
          'requested_stage_uses', v_uses_needed,
          'reason', coalesce(v_reason, 'physical_shortage_no_alternative'),
          'sporting_output_changed', false
        ));
        continue;
      end if;

      if v_applied_resource_id <> v_source_resource_id then
        v_changed := true;
        v_used_alt_ids := array_append(v_used_alt_ids, v_alt_unit_id);
        v_source_input := v_original_input #> array['preparation','raceSupplies',v_source_resource_id];

        if v_source_input is not null then
          v_temp_input := jsonb_set(
            v_temp_input,
            array['preparation','raceSupplies',v_applied_resource_id],
            v_source_input,
            true
          );
        end if;

        v_item := jsonb_set(v_item, '{resourceId}', to_jsonb(v_applied_resource_id), false);
        v_remaps := v_remaps || jsonb_build_array(jsonb_build_object(
          'manifest_resource_id', v_source_resource_id,
          'applied_resource_id', v_applied_resource_id,
          'club_id', v_club_id,
          'supply_key', v_supply_key,
          'stage_date', v_stage_date,
          'reason', v_reason,
          'sporting_output_changed', false
        ));
      end if;
    end if;

    v_updates := v_updates || jsonb_build_array(v_item);
  end loop;

  if not v_changed then
    return public.universal_race_stage_apply_phase9_supplies_exact_v1(p_simulation_run_id)
      || jsonb_build_object(
        'durable_resource_rebound_count', 0,
        'durable_resource_rebounds', '[]'::jsonb,
        'durable_resource_shortage_skip_count', 0,
        'durable_resource_shortage_skips', '[]'::jsonb,
        'publication_recovery_rule', 'interchangeable_or_nonblocking_shortage_v2'
      );
  end if;

  v_temp_result := jsonb_set(
    v_temp_result,
    '{application_manifest,phase9ResourceUpdates}',
    v_updates,
    true
  );

  update public.race_stage_simulation_runs
  set input_snapshot_json = v_temp_input,
      result_summary_json = v_temp_result,
      updated_at = clock_timestamp()
  where id = p_simulation_run_id;

  begin
    v_result := public.universal_race_stage_apply_phase9_supplies_exact_v1(p_simulation_run_id);
  exception when others then
    update public.race_stage_simulation_runs
    set input_snapshot_json = v_original_input,
        result_summary_json = v_original_result,
        updated_at = clock_timestamp()
    where id = p_simulation_run_id;
    raise;
  end;

  update public.race_stage_simulation_runs
  set input_snapshot_json = v_original_input,
      result_summary_json = v_original_result,
      updated_at = clock_timestamp()
  where id = p_simulation_run_id;

  for v_map in select value from jsonb_array_elements(v_remaps)
  loop
    update public.race_engine_stage_supply_applications a
    set metadata = coalesce(a.metadata,'{}'::jsonb) || jsonb_build_object(
      'manifest_resource_id', v_map ->> 'manifest_resource_id',
      'applied_resource_id', v_map ->> 'applied_resource_id',
      'resource_rebound', true,
      'resource_rebound_reason', v_map ->> 'reason',
      'sporting_output_changed', false
    )
    where a.simulation_run_id = p_simulation_run_id
      and a.resource_id = v_map ->> 'applied_resource_id';
  end loop;

  for v_map in select value from jsonb_array_elements(v_skips)
  loop
    insert into public.race_engine_stage_supply_applications (
      simulation_run_id,
      stage_id,
      race_id,
      club_id,
      resource_id,
      supply_key,
      resource_kind,
      quantity_used,
      stage_uses_used,
      applied_game_date,
      metadata
    )
    values (
      p_simulation_run_id,
      v_run.stage_id,
      v_run.race_id,
      nullif(v_map ->> 'club_id', '')::uuid,
      v_map ->> 'manifest_resource_id',
      v_map ->> 'supply_key',
      'durable_supply_unit',
      null,
      0,
      v_stage_date,
      jsonb_build_object(
        'source', 'publication_recovery_durable_supply_shortage_v2',
        'manifest_resource_id', v_map ->> 'manifest_resource_id',
        'physical_application_skipped', true,
        'physical_application_skip_reason', v_map ->> 'reason',
        'requested_stage_uses', coalesce(nullif(v_map ->> 'requested_stage_uses','')::integer,0),
        'immutable_manifest_preserved', true,
        'sporting_output_changed', false
      )
    )
    on conflict (simulation_run_id, resource_id) do update
    set stage_uses_used = 0,
        metadata = excluded.metadata;
  end loop;

  return v_result || jsonb_build_object(
    'durable_resource_rebound_count', jsonb_array_length(v_remaps),
    'durable_resource_rebounds', v_remaps,
    'durable_resource_shortage_skip_count', jsonb_array_length(v_skips),
    'durable_resource_shortage_skips', v_skips,
    'rebound_rule', 'interchangeable_unpublished_durable_supply_units_v1',
    'publication_recovery_rule', 'interchangeable_or_nonblocking_shortage_v2'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_enforce_mandatory_jerseys_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race uuid;
  v_no integer;
  v_date date;
  v_race_name text;
  x record;
  v_req integer;
  v_owner uuid;
  v_avail integer;
  v_reserved integer;
  v_owner_total integer;
  v_missing integer;
  v_ai boolean;
  v_user uuid;
  v_elig jsonb;
  v_checked integer := 0;
  v_ai_fill integer := 0;
  v_penalized integer := 0;
  v_decisions jsonb := '[]'::jsonb;
begin
  select s.race_id,s.stage_number,s.stage_date::date,r.name
  into v_race,v_no,v_date,v_race_name
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_stage_id;
  if v_race is null then raise exception 'Stage % was not found.',p_stage_id; end if;

  for x in
    select t.club_id as team_id,
           public.universal_race_resource_owner_club_v1(t.club_id) as resource_owner_club_id,
           t.is_ai_filler,t.club_name,c.club_type
    from public.race_participant_teams_v1 t
    join public.clubs c on c.id=t.club_id
    where t.race_id=v_race
      and lower(coalesce(t.status,'accepted'))='accepted'
    order by case when coalesce(c.club_type,'main')='main' then 0 else 1 end,t.club_id
  loop
    if public.universal_race_team_disqualified_for_stage_v1(v_race,x.team_id,v_no) then
      v_decisions:=v_decisions||jsonb_build_array(jsonb_build_object(
        'team_id',x.team_id,'team_name',x.club_name,'status','blocked_non_jersey_reason'
      ));
      continue;
    end if;

    v_req:=public.universal_race_team_required_jerseys_v1(v_race,x.team_id);
    if v_req<=0 then continue; end if;
    v_checked:=v_checked+1;
    v_owner:=x.resource_owner_club_id;
    if v_owner is null then raise exception 'Could not resolve physical resource owner for team %.',x.team_id; end if;

    select coalesce(c.is_ai,false) or coalesce(x.is_ai_filler,false),owner.owner_user_id
    into v_ai,v_user
    from public.clubs c
    join public.clubs owner on owner.id=v_owner
    where c.id=x.team_id;

    perform public.sync_race_supply_units_from_summary_v1(v_owner);
    v_elig:=public.race_team_stage_eligibility_v1(p_stage_id,x.team_id);
    v_avail:=coalesce(nullif(v_elig->>'effective_available_jersey_units','')::integer,0);
    v_reserved:=coalesce(nullif(v_elig->>'other_race_reserved_units','')::integer,0);
    v_owner_total:=coalesce(nullif(v_elig->>'total_usable_owned_units_before_same_day_rule','')::integer,0);

    if coalesce(v_ai,false) and v_avail<v_req then
      perform public.universal_race_team_ensure_ai_jerseys_v1(v_race,x.team_id,greatest(v_req+v_reserved,v_req));
      v_elig:=public.race_team_stage_eligibility_v1(p_stage_id,x.team_id);
      v_avail:=coalesce(nullif(v_elig->>'effective_available_jersey_units','')::integer,0);
      v_owner_total:=coalesce(nullif(v_elig->>'total_usable_owned_units_before_same_day_rule','')::integer,0);
      if v_avail>=v_req then v_ai_fill:=v_ai_fill+1; end if;
    end if;

    v_missing:=greatest(v_req-v_avail,0);
    if v_missing>0 then
      v_penalized:=v_penalized+1;
      if v_user is not null and not coalesce(v_ai,false) then
        perform public.create_race_team_jersey_shortage_penalty_notification_v1(
          v_user,v_race,p_stage_id,x.team_id,v_req,v_avail
        );
      end if;
      v_elig:=public.race_team_stage_eligibility_v1(p_stage_id,x.team_id);
      v_decisions:=v_decisions||jsonb_build_array(jsonb_build_object(
        'team_id',x.team_id,'team_name',x.club_name,'resource_owner_club_id',v_owner,
        'status','eligible_with_jersey_penalty','required_jerseys',v_req,
        'owner_usable_jerseys',v_owner_total,'other_race_reserved_jerseys',v_reserved,
        'available_jerseys_after_reservations',v_avail,'missing_jerseys',v_missing,
        'preparation_bonus_reduction_pct',v_elig->'preparation_bonus_reduction_pct',
        'energy_cost_penalty_pct',v_elig->'energy_cost_penalty_pct',
        'post_stage_fatigue_penalty_pct',v_elig->'post_stage_fatigue_penalty_pct',
        'team_remains_in_race',true,'from_stage_number',v_no
      ));
    else
      v_decisions:=v_decisions||jsonb_build_array(jsonb_build_object(
        'team_id',x.team_id,'team_name',x.club_name,'resource_owner_club_id',v_owner,
        'status','eligible','required_jerseys',v_req,'owner_usable_jerseys',v_owner_total,
        'other_race_reserved_jerseys',v_reserved,'available_jerseys_after_reservations',v_avail,
        'ai',coalesce(v_ai,false)
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'status','completed','race_id',v_race,'stage_id',p_stage_id,'stage_number',v_no,
    'teams_checked',v_checked,'teams_newly_disqualified',0,
    'teams_with_jersey_penalty',v_penalized,'ai_teams_auto_provisioned',v_ai_fill,
    'jersey_rule','optional_with_proportional_performance_penalty_v1',
    'resource_rule','canonical_effective_race_supply_v2','decisions',v_decisions
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_process_lifecycle_v1(p_max_publications integer DEFAULT 4)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pass jsonb;
  v_current_game_at timestamp without time zone;
  v_fast_forwarded integer := 0;
  v_published integer := 0;
  v_scenario_finalization jsonb;
begin
  v_pass := public.universal_race_stage_process_lifecycle_core_v1(1);
  v_scenario_finalization := public.universal_race_stage_finalize_ready_scenarios_v1(8);

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  update public.race_stage_automation_state state
  set details = coalesce(state.details,'{}'::jsonb) || jsonb_build_object(
        'replay_closes_at_real', clock_timestamp(),
        'historical_catchup_replay_fast_forwarded', true,
        'historical_catchup_fast_forwarded_at_real', clock_timestamp(),
        'historical_catchup_current_game_at', v_current_game_at,
        'historical_catchup_rule','replay_first_opened_at_least_30_game_minutes_late_v2'
      ),
      last_checked_at = clock_timestamp(),
      updated_at = clock_timestamp()
  from public.race_stage_simulation_runs run
  where run.id = state.simulation_run_id
    and state.last_status = 'replay_live'
    and public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone + interval '30 minutes' <= v_current_game_at
    and coalesce(
        nullif(state.details ->> 'replay_opened_game_at', '')::timestamp,
        public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone
      )
        >= public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone + interval '30 minutes'
    and run.status = 'running'
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
    and coalesce(run.result_summary_json ->> 'calculation_contract', '') = 'universal_phase11b_calculated_hidden_v1'
    and not exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id = state.stage_id)
    and (nullif(state.details ->> 'replay_closes_at_real', '') is null
      or (state.details ->> 'replay_closes_at_real')::timestamptz > clock_timestamp());
  get diagnostics v_fast_forwarded = row_count;

  v_published := coalesce(nullif(v_pass ->> 'published_count', '')::integer, 0);

  return jsonb_build_object(
    'status','completed',
    'current_game_at',v_current_game_at,
    'historical_catchup_fast_forwarded_count',v_fast_forwarded,
    'published_count',v_published,
    'pass',v_pass,
    'scenario_finalization',v_scenario_finalization,
    'historical_catchup_rule','replay_first_opened_at_least_30_game_minutes_late_v2',
    'official_result_reveal_rule','not_before_stage_start_plus_30_game_minutes_v1',
    'publication_budget_per_lifecycle_call',1
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_validate_point_contract_v1(p_stage_id uuid, p_input_snapshot jsonb DEFAULT NULL::jsonb, p_universal_result jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_format text;
  v_tt_structure_ok boolean := false;
  v_start_count integer := 0;
  v_finish_count integer := 0;
  v_other_invalid integer := 0;
  v_legacy_invalid integer := 0;
begin
  v_result := public.universal_race_stage_validate_point_contract_legacy_v1(
    p_stage_id,p_input_snapshot,p_universal_result
  );

  if coalesce(v_result->>'status','')='point_contract_ready' then
    return v_result;
  end if;

  select lower(coalesce(s.stage_format,'road_race'))
  into v_format
  from public.race_stages s
  where s.id=p_stage_id;

  if v_format not in ('individual_time_trial','team_time_trial','prologue') then
    return v_result;
  end if;

  select
    count(*) filter (where upper(p.point_type)='START')::integer,
    count(*) filter (where upper(p.point_type)='FINISH')::integer,
    count(*) filter (
      where
        upper(p.point_type) not in ('START','FINISH','INTERMEDIATE_SPRINT','BONUS_SPRINT','KOM')
        or p.km_from_start < 0
        or p.km_from_start > s.distance_km
        or jsonb_typeof(p.points_scheme) <> 'array'
        or jsonb_typeof(p.time_bonus_seconds) <> 'array'
        or (
          upper(p.point_type) not in ('START','FINISH')
          and greatest(
            case when jsonb_typeof(p.points_scheme)='array' then jsonb_array_length(p.points_scheme) else 0 end,
            case when jsonb_typeof(p.time_bonus_seconds)='array' then jsonb_array_length(p.time_bonus_seconds) else 0 end
          ) <= 0
        )
    )::integer
  into v_start_count,v_finish_count,v_other_invalid
  from public.race_stage_points p
  join public.race_stages s on s.id=p.stage_id
  where p.stage_id=p_stage_id
  group by s.distance_km;

  v_tt_structure_ok := coalesce(v_start_count,0)=1
    and coalesce(v_finish_count,0)=1
    and coalesce(v_other_invalid,0)=0;

  if not v_tt_structure_ok then
    return v_result;
  end if;

  if not coalesce((v_result#>>'{input,ready}')::boolean,true)
     or not coalesce((v_result#>>'{output,ready}')::boolean,true)
  then
    return v_result;
  end if;

  v_legacy_invalid := coalesce(nullif(v_result#>>'{canonical,invalid_row_count}','')::integer,0);

  v_result := jsonb_set(v_result,'{status}','"point_contract_ready"'::jsonb,true);
  v_result := jsonb_set(v_result,'{canonical,ready}','true'::jsonb,true);
  v_result := jsonb_set(v_result,'{canonical,invalid_row_count}','0'::jsonb,true);
  v_result := jsonb_set(v_result,'{canonical,legacy_invalid_row_count}',to_jsonb(v_legacy_invalid),true);
  v_result := jsonb_set(v_result,'{canonical,time_trial_non_scoring_finish_allowed}','true'::jsonb,true);
  v_result := jsonb_set(v_result,'{canonical,stage_format}',to_jsonb(v_format),true);
  v_result := jsonb_set(v_result,'{validation_model}','"phase11_time_trial_finish_exception_v1"'::jsonb,true);

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_issue_emergency_loan(p_club_id uuid, p_reason text, p_ref_id text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_finance_club_id uuid;
  v_is_ai boolean := false;
begin
  v_finance_club_id := public.finance_resolve_paying_club_id(p_club_id);

  select coalesce(c.is_ai,false)
    into v_is_ai
  from public.clubs c
  where c.id=v_finance_club_id;

  if v_is_ai then
    return jsonb_build_object(
      'ok',true,
      'status','ai_unlimited_funds',
      'club_id',v_finance_club_id,
      'loan_issued',false,
      'reason','AI clubs do not use insolvency or emergency loans.'
    );
  end if;

  return public.finance_issue_emergency_loan_non_ai_core_v1(
    p_club_id,p_reason,p_ref_id,p_idempotency_key
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_ensure_mandatory_funds(p_club_id uuid, p_required_amount bigint, p_reason text, p_ref_id text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_finance_club_id uuid;
  v_is_ai boolean := false;
begin
  if p_required_amount is null or p_required_amount <= 0 then
    return jsonb_build_object(
      'ok',true,
      'status','not_required',
      'required_amount',coalesce(p_required_amount,0)
    );
  end if;

  v_finance_club_id := public.finance_resolve_paying_club_id(p_club_id);

  select coalesce(c.is_ai,false)
    into v_is_ai
  from public.clubs c
  where c.id=v_finance_club_id;

  if v_is_ai then
    return jsonb_build_object(
      'ok',true,
      'status','ai_unlimited_funds',
      'club_id',v_finance_club_id,
      'required_amount',p_required_amount,
      'loans_issued',0,
      'financial_block',false
    );
  end if;

  return public.finance_ensure_mandatory_funds_non_ai_core_v1(
    p_club_id,p_required_amount,p_reason,p_ref_id,p_idempotency_key
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_liquidate_club_for_insolvency(p_club_id uuid, p_reason text, p_ref_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_finance_club_id uuid;
  v_is_ai boolean := false;
begin
  v_finance_club_id := public.finance_resolve_paying_club_id(p_club_id);

  select coalesce(c.is_ai,false)
    into v_is_ai
  from public.clubs c
  where c.id=v_finance_club_id;

  if v_is_ai then
    return jsonb_build_object(
      'ok',true,
      'status','ai_unlimited_funds_no_liquidation',
      'club_id',v_finance_club_id,
      'liquidated',false,
      'reason','AI clubs are exempt from insolvency liquidation.'
    );
  end if;

  return public.finance_liquidate_club_for_insolvency_non_ai_core_v1(
    p_club_id,p_reason,p_ref_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_spend_from_club(p_club_id uuid, p_amount bigint, p_type text DEFAULT 'expense'::text, p_sink_code text DEFAULT 'SINK'::text, p_idempotency_key text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_is_ai boolean := false;
  v_club_acct uuid;
  v_existing uuid;
begin
  select coalesce(c.is_ai,false)
    into v_is_ai
  from public.clubs c
  where c.id=p_club_id;

  if not v_is_ai then
    return public.finance_spend_from_club_non_ai_core_v1(
      p_club_id,p_amount,p_type,p_sink_code,p_idempotency_key,p_metadata
    );
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be > 0';
  end if;

  if p_idempotency_key is not null then
    select t.id
      into v_existing
    from finance.transactions t
    where t.idempotency_key=p_idempotency_key
    order by t.created_at desc
    limit 1;

    if v_existing is not null then
      return public.finance_spend_from_club_non_ai_core_v1(
        p_club_id,p_amount,p_type,p_sink_code,p_idempotency_key,p_metadata
      );
    end if;
  end if;

  perform public.finance_get_or_create_club_account(p_club_id,'CASH','main');

  select a.id
    into v_club_acct
  from finance.accounts a
  where a.club_id=p_club_id
    and a.currency='CASH'
    and a.kind='main'
  limit 1;

  insert into finance.account_balances(account_id,balance)
  values (v_club_acct,0)
  on conflict (account_id) do nothing;

  update finance.account_balances
  set balance=greatest(balance,p_amount)
  where account_id=v_club_acct;

  return public.finance_spend_from_club_non_ai_core_v1(
    p_club_id,p_amount,p_type,p_sink_code,p_idempotency_key,p_metadata
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_charge_race_cost(p_club_id uuid, p_race_id uuid, p_amount bigint, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_is_ai boolean := false;
  v_club_acct uuid;
  v_existing uuid;
begin
  select coalesce(c.is_ai,false)
    into v_is_ai
  from public.clubs c
  where c.id=p_club_id;

  if not v_is_ai then
    return public.finance_charge_race_cost_non_ai_core_v1(
      p_club_id,p_race_id,p_amount,p_metadata
    );
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Race cost amount must be > 0';
  end if;

  select l.transaction_id
    into v_existing
  from finance.event_locks l
  where l.event_type='race_cost'
    and l.club_id=p_club_id
    and l.ref_id=p_race_id
  limit 1;

  if v_existing is not null then
    return public.finance_charge_race_cost_non_ai_core_v1(
      p_club_id,p_race_id,p_amount,p_metadata
    );
  end if;

  perform public.finance_get_or_create_club_account(p_club_id,'CASH','main');

  select a.id
    into v_club_acct
  from finance.accounts a
  where a.club_id=p_club_id
    and a.currency='CASH'
    and a.kind='main'
  limit 1;

  insert into finance.account_balances(account_id,balance)
  values (v_club_acct,0)
  on conflict (account_id) do nothing;

  update finance.account_balances
  set balance=greatest(balance,p_amount)
  where account_id=v_club_acct;

  return public.finance_charge_race_cost_non_ai_core_v1(
    p_club_id,p_race_id,p_amount,
    coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object(
      'ai_unlimited_funds',true,
      'ai_finance_policy','unlimited_funds_no_insolvency'
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_apply_race_development_condition_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_anchor_date date;
  v_race_days_last_14 integer := 0;
  v_race_days_last_30 integer := 0;
  v_total_race_events integer := 0;
begin
  if coalesce(new.applied_to_condition, false) then
    return new;
  end if;

  v_anchor_date := coalesce(
    public.get_current_game_date_date(),
    new.stage_date
  );

  select
    count(distinct e.stage_date) filter (
      where v_anchor_date is not null
        and e.stage_date between v_anchor_date - 13 and v_anchor_date
    )::integer,
    count(distinct e.stage_date) filter (
      where v_anchor_date is not null
        and e.stage_date between v_anchor_date - 29 and v_anchor_date
    )::integer,
    count(*)::integer
  into
    v_race_days_last_14,
    v_race_days_last_30,
    v_total_race_events
  from public.rider_race_development_events e
  where e.rider_id = new.rider_id;

  insert into public.rider_race_condition (
    rider_id,
    race_sharpness,
    last_raced_on,
    race_days_last_14,
    race_days_last_30,
    total_race_days,
    last_stage_sharpness_delta,
    last_stage_overload_penalty,
    updated_at
  )
  values (
    new.rider_id,
    least(
      100,
      greatest(
        0,
        50 + coalesce(new.sharpness_delta, 0) - coalesce(new.overload_penalty, 0)
      )
    )::numeric(6,2),
    new.stage_date,
    coalesce(v_race_days_last_14, 0),
    coalesce(v_race_days_last_30, 0),
    coalesce(v_total_race_events, 0),
    coalesce(new.sharpness_delta, 0)::numeric(8,3),
    coalesce(new.overload_penalty, 0)::numeric(8,3),
    now()
  )
  on conflict (rider_id) do update
  set
    race_sharpness = least(
      100,
      greatest(
        0,
        public.rider_race_condition.race_sharpness
        + coalesce(new.sharpness_delta, 0)
        - coalesce(new.overload_penalty, 0)
      )
    )::numeric(6,2),
    last_raced_on = greatest(
      coalesce(public.rider_race_condition.last_raced_on, new.stage_date),
      new.stage_date
    ),
    race_days_last_14 = coalesce(v_race_days_last_14, 0),
    race_days_last_30 = coalesce(v_race_days_last_30, 0),
    total_race_days = coalesce(v_total_race_events, 0),
    last_stage_sharpness_delta = case
      when new.stage_date is not null
       and (
         public.rider_race_condition.last_raced_on is null
         or new.stage_date >= public.rider_race_condition.last_raced_on
       )
      then coalesce(new.sharpness_delta, 0)::numeric(8,3)
      else public.rider_race_condition.last_stage_sharpness_delta
    end,
    last_stage_overload_penalty = case
      when new.stage_date is not null
       and (
         public.rider_race_condition.last_raced_on is null
         or new.stage_date >= public.rider_race_condition.last_raced_on
       )
      then coalesce(new.overload_penalty, 0)::numeric(8,3)
      else public.rider_race_condition.last_stage_overload_penalty
    end,
    updated_at = now();

  update public.rider_race_development_events
  set
    applied_to_condition = true,
    updated_at = now()
  where id = new.id
    and applied_to_condition = false;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fill_race_ai_teams_uwt_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race record;
  v_rule record;
  v_min_riders integer;
  v_max_teams integer;
  v_world_target integer;
  v_pro_target integer;
  v_existing_total integer := 0;
  v_existing_world integer := 0;
  v_existing_pro integer := 0;
  v_slots integer := 0;
  v_inserted_pro integer := 0;
  v_inserted_world integer := 0;
  v_inserted_world_fallback integer := 0;
  v_inserted_pro_fallback integer := 0;
  v_after_total integer := 0;
  v_after_world integer := 0;
  v_after_pro integer := 0;
  v_assignment_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtext('fill_race_ai_teams_v1'),
    hashtext(p_race_id::text)
  );

  select * into v_race
  from public.races
  where id = p_race_id;

  if not found then
    return jsonb_build_object('success',false,'error','race_not_found');
  end if;

  if v_race.category not in ('1.UWT','2.UWT') then
    return jsonb_build_object('success',false,'error','not_uwt_race','category',v_race.category);
  end if;

  select * into v_rule
  from public.race_entry_rules
  where race_id = p_race_id
  limit 1;

  if not found then
    return jsonb_build_object('success',false,'error','race_entry_rules_not_found');
  end if;

  v_min_riders := coalesce(v_rule.min_riders_per_team, 6);
  v_max_teams := greatest(
    coalesce(v_rule.max_teams, v_rule.target_teams, 20),
    coalesce(v_rule.target_teams, 20)
  );
  v_pro_target := round(v_max_teams::numeric * 0.20)::integer;
  v_world_target := greatest(0, v_max_teams - v_pro_target);

  select
    count(*)::integer,
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_existing_total, v_existing_world, v_existing_pro
  from public.race_team_entries e
  join public.clubs c on c.id = coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status in ('accepted','confirmed');

  create temporary table if not exists pg_temp.uwt_ai_fill_candidates_v1 (
    club_id uuid primary key,
    club_name text,
    country_code text,
    club_tier text,
    world_tier integer,
    reputation numeric,
    available_riders integer,
    geographic_priority integer
  ) on commit drop;

  truncate table pg_temp.uwt_ai_fill_candidates_v1;

  insert into pg_temp.uwt_ai_fill_candidates_v1(
    club_id,club_name,country_code,club_tier,world_tier,reputation,available_riders,geographic_priority
  )
  select
    pool.id,
    pool.name,
    pool.country_code,
    pool.club_tier::text,
    pool.world_tier,
    pool.reputation,
    available.available_riders,
    public.race_ai_geographic_priority_v1(v_race.country_code,pool.country_code)
  from public.ai_competition_filler_club_pool_v1 pool
  cross join lateral (
    select count(*)::integer as available_riders
    from public.club_roster cr
    where cr.club_id=pool.id
      and public.roster_status_allows_race_selection_v1(cr.availability_status)
      and not exists (
        select 1 from public.race_participant_riders same_race
        where same_race.race_id=p_race_id
          and same_race.rider_id=cr.rider_id
      )
      and not exists (
        select 1
        from public.race_participant_riders other_participation
        join public.races other_race on other_race.id=other_participation.race_id
        where other_participation.rider_id=cr.rider_id
          and other_participation.race_id<>p_race_id
          and daterange(other_race.start_date,coalesce(other_race.end_date,other_race.start_date)+1,'[)')
              && daterange(v_race.start_date,coalesce(v_race.end_date,v_race.start_date)+1,'[)')
      )
  ) available
  where coalesce(pool.is_active,true)=true
    and coalesce(pool.is_ai,true)=true
    and coalesce(pool.logo_path,'')<>''
    and available.available_riders>=v_min_riders
    and (
      pool.club_tier::text='worldteam'
      or (
        pool.club_tier::text='proteam'
        and public.race_ai_geographic_priority_v1(v_race.country_code,pool.country_code)<=2
      )
    )
    and not exists (
      select 1 from public.race_team_entries existing
      where existing.race_id=p_race_id
        and existing.club_id=pool.id
    )
    and not exists (
      select 1
      from public.race_team_entries other_entry
      join public.races other_race on other_race.id=other_entry.race_id
      where other_entry.club_id=pool.id
        and other_entry.status='accepted'
        and other_race.id<>p_race_id
        and daterange(other_race.start_date,coalesce(other_race.end_date,other_race.start_date)+1,'[)')
            && daterange(v_race.start_date,coalesce(v_race.end_date,v_race.start_date)+1,'[)')
    );

  -- Fill the 20% ProTeam share first. ProTeams are strictly host-country/same-market/same-macro-region only.
  v_slots := least(
    greatest(v_pro_target - coalesce(v_existing_pro,0),0),
    greatest(v_max_teams - coalesce(v_existing_total,0),0)
  );

  if v_slots>0 then
    with candidates as (
      select c.*
      from pg_temp.uwt_ai_fill_candidates_v1 c
      where c.club_tier='proteam'
        and c.geographic_priority<=2
      order by
        c.geographic_priority asc,
        coalesce(c.world_tier,99) asc,
        c.available_riders desc,
        coalesce(c.reputation,0) desc,
        c.club_id
      limit v_slots
    ), inserted as (
      insert into public.race_team_entries(
        id,race_id,club_id,participating_club_id,status,entry_source,is_ai_filler,auto_filled_at,
        commitment_score_snapshot,acceptance_score,review_round,decision_reason,reviewed_at,final_decision_at,created_at,updated_at
      )
      select
        gen_random_uuid(),p_race_id,c.club_id,c.club_id,'accepted','ai_fill',true,now(),
        null,null,1,
        'AI ProTeam added under UWT 80/20 field policy. ProTeams are restricted to the host country or same geographic region.',
        now(),now(),now(),now()
      from candidates c
      on conflict (race_id,club_id) do nothing
      returning id
    )
    select count(*)::integer into v_inserted_pro from inserted;
  end if;

  select
    count(*)::integer,
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_existing_total, v_existing_world, v_existing_pro
  from public.race_team_entries e
  join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status in ('accepted','confirmed');

  -- Fill the 80% WorldTeam share globally.
  v_slots := least(
    greatest(v_world_target - coalesce(v_existing_world,0),0),
    greatest(v_max_teams - coalesce(v_existing_total,0),0)
  );

  if v_slots>0 then
    with candidates as (
      select c.*
      from pg_temp.uwt_ai_fill_candidates_v1 c
      where c.club_tier='worldteam'
        and not exists (
          select 1 from public.race_team_entries e
          where e.race_id=p_race_id and e.club_id=c.club_id
        )
      order by
        coalesce(c.world_tier,99) asc,
        c.available_riders desc,
        coalesce(c.reputation,0) desc,
        c.geographic_priority asc,
        c.club_id
      limit v_slots
    ), inserted as (
      insert into public.race_team_entries(
        id,race_id,club_id,participating_club_id,status,entry_source,is_ai_filler,auto_filled_at,
        commitment_score_snapshot,acceptance_score,review_round,decision_reason,reviewed_at,final_decision_at,created_at,updated_at
      )
      select
        gen_random_uuid(),p_race_id,c.club_id,c.club_id,'accepted','ai_fill',true,now(),
        null,null,1,
        'AI WorldTeam added under UWT 80/20 field policy.',
        now(),now(),now(),now()
      from candidates c
      on conflict (race_id,club_id) do nothing
      returning id
    )
    select count(*)::integer into v_inserted_world from inserted;
  end if;

  select
    count(*)::integer,
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_after_total, v_after_world, v_after_pro
  from public.race_team_entries e
  join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status in ('accepted','confirmed');

  -- If the region cannot supply the full 20% ProTeam share, use extra WorldTeams rather than lower tiers or out-of-region ProTeams.
  v_slots := greatest(v_max_teams - coalesce(v_after_total,0),0);
  if v_slots>0 then
    with candidates as (
      select c.*
      from pg_temp.uwt_ai_fill_candidates_v1 c
      where c.club_tier='worldteam'
        and not exists (
          select 1 from public.race_team_entries e
          where e.race_id=p_race_id and e.club_id=c.club_id
        )
      order by
        coalesce(c.world_tier,99) asc,
        c.available_riders desc,
        coalesce(c.reputation,0) desc,
        c.geographic_priority asc,
        c.club_id
      limit v_slots
    ), inserted as (
      insert into public.race_team_entries(
        id,race_id,club_id,participating_club_id,status,entry_source,is_ai_filler,auto_filled_at,
        commitment_score_snapshot,acceptance_score,review_round,decision_reason,reviewed_at,final_decision_at,created_at,updated_at
      )
      select
        gen_random_uuid(),p_race_id,c.club_id,c.club_id,'accepted','ai_fill',true,now(),
        null,null,1,
        'Additional AI WorldTeam added because the host region could not supply the full UWT ProTeam quota.',
        now(),now(),now(),now()
      from candidates c
      on conflict (race_id,club_id) do nothing
      returning id
    )
    select count(*)::integer into v_inserted_world_fallback from inserted;
  end if;

  select count(*)::integer into v_after_total
  from public.race_team_entries
  where race_id=p_race_id and status in ('accepted','confirmed');

  -- Last-resort UWT-only fallback: if WorldTeams are unavailable, use additional regional ProTeams. Never Continental/Amateur.
  v_slots := greatest(v_max_teams - coalesce(v_after_total,0),0);
  if v_slots>0 then
    with candidates as (
      select c.*
      from pg_temp.uwt_ai_fill_candidates_v1 c
      where c.club_tier='proteam'
        and c.geographic_priority<=2
        and not exists (
          select 1 from public.race_team_entries e
          where e.race_id=p_race_id and e.club_id=c.club_id
        )
      order by
        c.geographic_priority asc,
        coalesce(c.world_tier,99) asc,
        c.available_riders desc,
        coalesce(c.reputation,0) desc,
        c.club_id
      limit v_slots
    ), inserted as (
      insert into public.race_team_entries(
        id,race_id,club_id,participating_club_id,status,entry_source,is_ai_filler,auto_filled_at,
        commitment_score_snapshot,acceptance_score,review_round,decision_reason,reviewed_at,final_decision_at,created_at,updated_at
      )
      select
        gen_random_uuid(),p_race_id,c.club_id,c.club_id,'accepted','ai_fill',true,now(),
        null,null,1,
        'Additional regional AI ProTeam added because insufficient WorldTeams were available. UWT lower-tier exclusion remains enforced.',
        now(),now(),now(),now()
      from candidates c
      on conflict (race_id,club_id) do nothing
      returning id
    )
    select count(*)::integer into v_inserted_pro_fallback from inserted;
  end if;

  select public.assign_ai_riders_to_race_v1(p_race_id)
  into v_assignment_result;

  select
    count(*)::integer,
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_after_total,v_after_world,v_after_pro
  from public.race_team_entries e
  join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status in ('accepted','confirmed');

  return jsonb_build_object(
    'success',true,
    'race_id',p_race_id,
    'race_name',v_race.name,
    'category',v_race.category,
    'policy','uwt_80_worldteam_20_regional_proteam_v1',
    'max_teams',v_max_teams,
    'worldteam_target',v_world_target,
    'proteam_target',v_pro_target,
    'accepted_after_fill',v_after_total,
    'worldteams_after_fill',v_after_world,
    'proteams_after_fill',v_after_pro,
    'continental_and_amateur_allowed',false,
    'proteam_geography','same_country_market_group_or_macro_region_only',
    'proteam_entries_added',v_inserted_pro,
    'worldteam_entries_added',v_inserted_world,
    'worldteam_fallback_entries_added',v_inserted_world_fallback,
    'proteam_fallback_entries_added',v_inserted_pro_fallback,
    'rider_assignment_result',v_assignment_result
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fill_race_ai_teams_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_category text;
  v_primary jsonb := '{}'::jsonb;
  v_hierarchy jsonb := '{}'::jsonb;
begin
  select category::text
  into v_category
  from public.races
  where id=p_race_id;

  if not found then
    return jsonb_build_object('success',false,'error','race_not_found');
  end if;

  /*
   * Preserve the race-class-specific composition model as the primary policy.
   * The universal hierarchy only fills whatever shortage remains.
   */
  if v_category in ('1.UWT','2.UWT') then
    v_primary := public.fill_race_ai_teams_uwt_v1(p_race_id);
  else
    v_primary := public.fill_race_ai_teams_pre_uwt_policy_v1(p_race_id);
  end if;

  v_hierarchy := public.fill_race_ai_teams_hierarchy_v1(p_race_id);

  return coalesce(v_primary,'{}'::jsonb) || jsonb_build_object(
    'universal_hierarchy_fallback',v_hierarchy,
    'universal_hierarchy_policy','worldteam_proteam_continental_amateur_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_race_application_v1(p_race_id uuid, p_club_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid := p_club_id;
  v_category text;
  v_club_tier text;
  v_geo integer;
begin
  if v_club_id is null then
    select public.get_my_primary_club_id() into v_club_id;
  end if;

  if v_club_id is null then
    return jsonb_build_object('success',false,'error','club_not_found');
  end if;

  select r.category::text,c.club_tier::text,
         public.race_ai_geographic_priority_v1(r.country_code,c.country_code)
  into v_category,v_club_tier,v_geo
  from public.races r
  join public.clubs c on c.id=v_club_id
  where r.id=p_race_id;

  if v_category in ('1.UWT','2.UWT')
     and not (
       v_club_tier='worldteam'
       or (v_club_tier='proteam' and coalesce(v_geo,3)<=2)
     ) then
    return jsonb_build_object(
      'success',false,
      'error','uwt_team_tier_not_eligible',
      'race_id',p_race_id,
      'club_id',v_club_id,
      'club_tier',v_club_tier,
      'message','UWT races accept WorldTeams globally and ProTeams only from the host country or same region. Continental and Amateur teams are not eligible.'
    );
  end if;

  return public.submit_race_application_pre_uwt_policy_v1(p_race_id,v_club_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.quote_race_application_v1(p_race_id uuid, p_club_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payload jsonb;
  v_club_id uuid;
  v_category text;
  v_club_tier text;
  v_geo integer;
begin
  v_payload := public.quote_race_application_pre_uwt_policy_v1(p_race_id,p_club_id);

  if coalesce((v_payload->>'success')::boolean,false) is not true then
    return v_payload;
  end if;

  begin
    v_club_id := (v_payload->>'club_id')::uuid;
  exception when others then
    v_club_id := p_club_id;
  end;

  select r.category::text,c.club_tier::text,
         public.race_ai_geographic_priority_v1(r.country_code,c.country_code)
  into v_category,v_club_tier,v_geo
  from public.races r
  join public.clubs c on c.id=v_club_id
  where r.id=p_race_id;

  if v_category in ('1.UWT','2.UWT') then
    v_payload := v_payload || jsonb_build_object(
      'uwt_field_policy','80% WorldTeams / 20% regional ProTeams',
      'uwt_continental_amateur_allowed',false,
      'uwt_proteam_geography','host country or same region only'
    );

    if not (
      v_club_tier='worldteam'
      or (v_club_tier='proteam' and coalesce(v_geo,3)<=2)
    ) then
      v_payload := v_payload || jsonb_build_object(
        'can_apply',false,
        'estimated_acceptance_chance_pct',0,
        'chance_label','Not eligible',
        'chance_summary','This team tier is not eligible for UWT races.',
        'message','UWT races accept WorldTeams globally and ProTeams only from the host country or same region. Continental and Amateur teams are not eligible.',
        'eligibility_error','uwt_team_tier_not_eligible'
      );
    end if;
  end if;

  return v_payload;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.review_race_applications_uwt_v1(p_race_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race record;
  v_rule record;
  v_current record;
  v_today_ordinal integer;
  v_team_list_ordinal integer;
  v_target_teams integer;
  v_world_target integer;
  v_pro_target integer;
  v_world_accepted integer := 0;
  v_pro_accepted integer := 0;
  v_world_available integer := 0;
  v_pro_available integer := 0;
  v_ineligible_declined integer := 0;
  v_provisional_accepted integer := 0;
  v_new_accepted integer := 0;
  v_new_declined integer := 0;
begin
  perform * from public.recalculate_race_entry_deadlines_v1(p_race_id);

  select * into v_race from public.races where id=p_race_id;
  if not found then
    return jsonb_build_object('success',false,'error','race_not_found');
  end if;

  if v_race.category not in ('1.UWT','2.UWT') then
    return jsonb_build_object('success',false,'error','not_uwt_race');
  end if;

  select * into v_rule from public.race_entry_rules where race_id=p_race_id limit 1;
  if not found then
    return jsonb_build_object('success',false,'error','race_entry_rules_not_found');
  end if;

  select * into v_current from public.get_current_game_date_parts() limit 1;
  v_today_ordinal := public.game_date_ordinal_v1(v_current.season_number,v_current.month_number,v_current.day_number);
  v_team_list_ordinal := public.game_date_ordinal_v1(
    v_rule.team_list_announcement_season_number,
    v_rule.team_list_announcement_month_number,
    v_rule.team_list_announcement_day_number
  );

  if not p_force and v_today_ordinal < v_team_list_ordinal then
    return jsonb_build_object(
      'success',false,
      'error','review_not_due_yet',
      'current_game_date',public.game_date_display_v1(v_current.season_number,v_current.month_number,v_current.day_number),
      'team_list_announcement',public.game_date_display_v1(
        v_rule.team_list_announcement_season_number,
        v_rule.team_list_announcement_month_number,
        v_rule.team_list_announcement_day_number
      )
    );
  end if;

  v_target_teams := least(
    coalesce(v_rule.target_teams,v_rule.max_teams,v_rule.min_teams,20),
    coalesce(v_rule.max_teams,v_rule.target_teams,20)
  );
  v_pro_target := round(v_target_teams::numeric*0.20)::integer;
  v_world_target := greatest(0,v_target_teams-v_pro_target);

  -- Reject any pending lower-tier or out-of-region ProTeam application on UWT races.
  with changed as (
    update public.race_team_entries e
    set
      status='declined',
      review_round=2,
      reviewed_at=now(),
      final_decision_at=now(),
      decision_reason='Declined by UWT eligibility policy: only WorldTeams and host-country/same-region ProTeams may enter.',
      updated_at=now()
    from public.clubs c
    where e.race_id=p_race_id
      and c.id=e.club_id
      and coalesce(e.is_ai_filler,false)=false
      and lower(coalesce(e.entry_source::text,'user')) not in ('ai','ai_fill','ai_filler')
      and e.status in ('applied','under_review','provisionally_accepted')
      and not (
        c.club_tier::text='worldteam'
        or (
          c.club_tier::text='proteam'
          and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
        )
      )
    returning 1
  )
  select count(*)::integer into v_ineligible_declined from changed;

  update public.race_team_entries e
  set
    commitment_score_snapshot=coalesce(e.commitment_score_snapshot,public.get_or_create_club_race_commitment_score_v1(e.club_id)),
    acceptance_score=coalesce(
      e.acceptance_score,
      coalesce(e.commitment_score_snapshot,public.get_or_create_club_race_commitment_score_v1(e.club_id),50)+(random()*10)
    ),
    reviewed_at=now(),
    updated_at=now()
  from public.clubs c
  where e.race_id=p_race_id
    and c.id=e.club_id
    and coalesce(e.is_ai_filler,false)=false
    and lower(coalesce(e.entry_source::text,'user')) not in ('ai','ai_fill','ai_filler')
    and e.status in ('applied','under_review','provisionally_accepted')
    and (
      c.club_tier::text='worldteam'
      or (
        c.club_tier::text='proteam'
        and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
      )
    );

  select
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_world_accepted,v_pro_accepted
  from public.race_team_entries e
  join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status='accepted';

  v_world_available := greatest(v_world_target-coalesce(v_world_accepted,0),0);
  v_pro_available := greatest(v_pro_target-coalesce(v_pro_accepted,0),0);

  with ranked as (
    select
      e.id,
      c.club_tier::text as club_tier,
      row_number() over (
        partition by c.club_tier::text
        order by coalesce(e.acceptance_score,0) desc,e.created_at asc,e.id
      ) as rn
    from public.race_team_entries e
    join public.clubs c on c.id=e.club_id
    where e.race_id=p_race_id
      and e.status='provisionally_accepted'
      and coalesce(e.is_ai_filler,false)=false
      and (
        c.club_tier::text='worldteam'
        or (
          c.club_tier::text='proteam'
          and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
        )
      )
  ), changed as (
    update public.race_team_entries e
    set
      status=case
        when ranked.club_tier='worldteam' and ranked.rn<=v_world_available then 'accepted'
        when ranked.club_tier='proteam' and ranked.rn<=v_pro_available then 'accepted'
        else 'under_review'
      end,
      review_round=2,
      reviewed_at=now(),
      final_decision_at=case
        when ranked.club_tier='worldteam' and ranked.rn<=v_world_available then now()
        when ranked.club_tier='proteam' and ranked.rn<=v_pro_available then now()
        else null
      end,
      decision_reason=case
        when ranked.club_tier='worldteam' and ranked.rn<=v_world_available then 'Accepted from protected preliminary field within UWT WorldTeam quota.'
        when ranked.club_tier='proteam' and ranked.rn<=v_pro_available then 'Accepted from protected preliminary field within UWT regional ProTeam quota.'
        else 'Moved to final reserve review because this UWT tier quota was already filled.'
      end,
      updated_at=now()
    from ranked
    where e.id=ranked.id
    returning e.status
  )
  select count(*) filter (where status='accepted')::integer
  into v_provisional_accepted
  from changed;

  select
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_world_accepted,v_pro_accepted
  from public.race_team_entries e
  join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status='accepted';

  v_world_available := greatest(v_world_target-coalesce(v_world_accepted,0),0);
  v_pro_available := greatest(v_pro_target-coalesce(v_pro_accepted,0),0);

  with candidates as (
    select
      e.id,
      c.club_tier::text as club_tier,
      row_number() over (
        partition by c.club_tier::text
        order by
          case when coalesce(e.review_round,0)=1 and coalesce(e.decision_reason,'') like 'Reserve #%' then 0 else 1 end,
          coalesce(e.acceptance_score,0) desc,
          e.created_at asc,
          e.id
      ) as selection_rank
    from public.race_team_entries e
    join public.clubs c on c.id=e.club_id
    where e.race_id=p_race_id
      and e.status in ('applied','under_review')
      and coalesce(e.is_ai_filler,false)=false
      and lower(coalesce(e.entry_source::text,'user')) not in ('ai','ai_fill','ai_filler')
      and (
        c.club_tier::text='worldteam'
        or (
          c.club_tier::text='proteam'
          and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
        )
      )
  ), changed as (
    update public.race_team_entries e
    set
      status=case
        when candidates.club_tier='worldteam' and candidates.selection_rank<=v_world_available then 'accepted'
        when candidates.club_tier='proteam' and candidates.selection_rank<=v_pro_available then 'accepted'
        else 'declined'
      end,
      review_round=2,
      reviewed_at=now(),
      final_decision_at=now(),
      decision_reason=case
        when candidates.club_tier='worldteam' and candidates.selection_rank<=v_world_available then 'Accepted by final UWT review within WorldTeam quota.'
        when candidates.club_tier='proteam' and candidates.selection_rank<=v_pro_available then 'Accepted by final UWT review within regional ProTeam quota.'
        else 'Declined by final UWT review because this team-tier quota was filled.'
      end,
      updated_at=now()
    from candidates
    where e.id=candidates.id
    returning e.status
  )
  select
    count(*) filter (where status='accepted')::integer,
    count(*) filter (where status='declined')::integer
  into v_new_accepted,v_new_declined
  from changed;

  return jsonb_build_object(
    'success',true,
    'race_id',p_race_id,
    'race_name',v_race.name,
    'policy','uwt_80_worldteam_20_regional_proteam_v1',
    'target_teams',v_target_teams,
    'worldteam_target',v_world_target,
    'proteam_target',v_pro_target,
    'ineligible_pending_applications_declined',coalesce(v_ineligible_declined,0),
    'provisional_accepted',coalesce(v_provisional_accepted,0),
    'new_accepted_from_reserve_or_late_pool',coalesce(v_new_accepted,0),
    'new_declined',coalesce(v_new_declined,0),
    'message','UWT applications reviewed with 80/20 WorldTeam/regional-ProTeam quotas. Continental and Amateur teams are excluded.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.review_race_applications_v1(p_race_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_category text;
begin
  select category::text into v_category
  from public.races
  where id=p_race_id;

  if v_category in ('1.UWT','2.UWT') then
    return public.review_race_applications_uwt_v1(p_race_id,p_force);
  end if;

  return public.review_race_applications_pre_uwt_policy_v1(p_race_id,p_force);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reconcile_future_uwt_race_fields_v1(p_race_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race record;
  v_max_teams integer;
  v_pro_target integer;
  v_human_pro integer;
  v_keep_ai_pro integer;
  v_removed_riders integer := 0;
  v_withdrawn_entries integer := 0;
  v_total_removed_riders integer := 0;
  v_total_withdrawn_entries integer := 0;
  v_fill jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  for v_race in
    select r.id,r.name,r.country_code,r.start_date,rer.max_teams,rer.target_teams
    from public.races r
    join public.race_entry_rules rer on rer.race_id=r.id
    where r.category in ('1.UWT','2.UWT')
      and r.start_date>public.get_current_game_date_date()
      and (p_race_id is null or r.id=p_race_id)
      and (
        rer.applications_status='closed'
        or lower(coalesce(r.metadata->>'team_list_announcement_finalized','false')) in ('true','1','yes')
      )
      and exists (
        select 1 from public.race_team_entries e
        where e.race_id=r.id
          and e.status in ('accepted','confirmed')
          and coalesce(e.is_ai_filler,false)=true
      )
    order by r.start_date,r.name
  loop
    v_max_teams := greatest(coalesce(v_race.max_teams,v_race.target_teams,20),coalesce(v_race.target_teams,20));
    v_pro_target := round(v_max_teams::numeric*0.20)::integer;

    -- Remove lower-tier AI fillers and out-of-region ProTeams from future UWT fields.
    with bad as (
      select e.id,coalesce(e.participating_club_id,e.club_id) as team_id
      from public.race_team_entries e
      join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
      where e.race_id=v_race.id
        and e.status in ('accepted','confirmed')
        and coalesce(e.is_ai_filler,false)=true
        and (
          c.club_tier::text not in ('worldteam','proteam')
          or (
            c.club_tier::text='proteam'
            and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)>2
          )
        )
    ), deleted as (
      delete from public.race_participant_riders pr
      using bad
      where pr.race_id=v_race.id
        and pr.team_id=bad.team_id
      returning pr.id
    )
    select count(*)::integer into v_removed_riders from deleted;

    with changed as (
      update public.race_team_entries e
      set
        status='withdrawn',
        decision_reason='Removed by UWT 80/20 field reconciliation: only WorldTeams and host-country/same-region ProTeams are eligible.',
        withdrawn_at=coalesce(e.withdrawn_at,now()),
        updated_at=now()
      from public.clubs c
      where e.race_id=v_race.id
        and c.id=coalesce(e.participating_club_id,e.club_id)
        and e.status in ('accepted','confirmed')
        and coalesce(e.is_ai_filler,false)=true
        and (
          c.club_tier::text not in ('worldteam','proteam')
          or (
            c.club_tier::text='proteam'
            and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)>2
          )
        )
      returning e.id
    )
    select count(*)::integer into v_withdrawn_entries from changed;

    v_total_removed_riders := v_total_removed_riders+coalesce(v_removed_riders,0);
    v_total_withdrawn_entries := v_total_withdrawn_entries+coalesce(v_withdrawn_entries,0);

    -- If legacy data has too many accepted AI ProTeams, keep only enough to reach the 20% quota after human ProTeams.
    select count(*)::integer into v_human_pro
    from public.race_team_entries e
    join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
    where e.race_id=v_race.id
      and e.status in ('accepted','confirmed')
      and coalesce(e.is_ai_filler,false)=false
      and c.club_tier::text='proteam';

    v_keep_ai_pro := greatest(v_pro_target-coalesce(v_human_pro,0),0);

    with ranked as (
      select
        e.id,
        coalesce(e.participating_club_id,e.club_id) as team_id,
        row_number() over (
          order by
            public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code) asc,
            coalesce(c.world_tier,99) asc,
            coalesce(c.reputation,0) desc,
            e.created_at asc,
            e.id
        ) as rn
      from public.race_team_entries e
      join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
      where e.race_id=v_race.id
        and e.status in ('accepted','confirmed')
        and coalesce(e.is_ai_filler,false)=true
        and c.club_tier::text='proteam'
        and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
    ), surplus as (
      select * from ranked where rn>v_keep_ai_pro
    ), deleted as (
      delete from public.race_participant_riders pr
      using surplus
      where pr.race_id=v_race.id and pr.team_id=surplus.team_id
      returning pr.id
    )
    select count(*)::integer into v_removed_riders from deleted;

    with ranked as (
      select
        e.id,
        row_number() over (
          order by
            public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code) asc,
            coalesce(c.world_tier,99) asc,
            coalesce(c.reputation,0) desc,
            e.created_at asc,
            e.id
        ) as rn
      from public.race_team_entries e
      join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
      where e.race_id=v_race.id
        and e.status in ('accepted','confirmed')
        and coalesce(e.is_ai_filler,false)=true
        and c.club_tier::text='proteam'
        and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
    ), changed as (
      update public.race_team_entries e
      set
        status='withdrawn',
        decision_reason='Removed by UWT 80/20 field reconciliation because the regional ProTeam quota was exceeded.',
        withdrawn_at=coalesce(e.withdrawn_at,now()),
        updated_at=now()
      from ranked
      where e.id=ranked.id and ranked.rn>v_keep_ai_pro
      returning e.id
    )
    select count(*)::integer into v_withdrawn_entries from changed;

    v_total_removed_riders := v_total_removed_riders+coalesce(v_removed_riders,0);
    v_total_withdrawn_entries := v_total_withdrawn_entries+coalesce(v_withdrawn_entries,0);

    v_fill := public.fill_race_ai_teams_uwt_v1(v_race.id);

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'race_id',v_race.id,
      'race_name',v_race.name,
      'fill_result',v_fill
    ));
  end loop;

  return jsonb_build_object(
    'success',true,
    'policy','uwt_80_worldteam_20_regional_proteam_v1',
    'future_only',true,
    'historical_results_untouched',true,
    'ai_entries_withdrawn',v_total_withdrawn_entries,
    'participant_riders_removed',v_total_removed_riders,
    'results',v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_user_daily_game_notification_v1(p_user_id uuid, p_type_code text, p_title text, p_message text, p_action_url text, p_payload_json jsonb, p_event_key text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type_id bigint;
  v_id bigint;
  v_payload jsonb;
  v_message text;
  v_changed boolean:=false;
begin
  select id into v_type_id from public.notification_types
  where code=p_type_code and is_active=true limit 1;
  if v_type_id is null then raise exception 'Notification type not found or inactive: %',p_type_code; end if;

  v_payload:=coalesce(p_payload_json,'{}'::jsonb)||jsonb_build_object('event_key',p_event_key,'type_code',p_type_code);
  v_message:=public.notification_daily_summary_message_v1(p_type_code,v_payload,p_message);

  select n.id into v_id
  from public.notifications n
  join public.user_notifications un on un.notification_id=n.id
  where un.user_id=p_user_id and un.deleted_at is null and n.payload_json->>'event_key'=p_event_key
  order by n.id desc limit 1;

  if v_id is null then
    insert into public.notifications(type_id,title,message,source,action_url,payload_json,created_at)
    values(v_type_id,p_title,v_message,'game',p_action_url,v_payload,now()) returning id into v_id;
    insert into public.user_notifications(user_id,notification_id,status,created_at)
    values(p_user_id,v_id,'unread',now());
  else
    select (n.type_id is distinct from v_type_id or n.title is distinct from p_title or n.message is distinct from v_message
      or n.action_url is distinct from p_action_url or n.payload_json is distinct from v_payload)
    into v_changed from public.notifications n where n.id=v_id;
    if v_changed then
      update public.notifications set type_id=v_type_id,title=p_title,message=v_message,action_url=p_action_url,payload_json=v_payload
      where id=v_id;
      update public.user_notifications set status='unread',read_at=null
      where user_id=p_user_id and notification_id=v_id and deleted_at is null;
    end if;
  end if;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_race_application_daily_update_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_open jsonb; v_closing jsonb; v_pending jsonb;
  v_open_count int; v_closing_count int; v_pending_count int;
  v_created int:=0; u record; v_event_key text;
begin
  for u in
    select distinct c.owner_user_id as user_id
    from public.clubs c
    where c.owner_user_id is not null and coalesce(c.club_type,'main')='main' and c.deleted_at is null
  loop
    select count(*)::int,coalesce(jsonb_agg(jsonb_build_object(
      'race_id',r.id,'race_name',r.name,'category',r.category,'start_date',r.start_date::date,
      'applications_close',coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number)),
      'days_until_close',coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number))-v_today
    ) order by coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number)),r.name),'[]'::jsonb)
    into v_open_count,v_open
    from public.races r join public.race_entry_rules rer on rer.race_id=r.id
    where r.status='scheduled' and rer.applications_status='open'
      and coalesce(rer.applications_open_game_date,public.make_game_rule_date_v1(rer.applications_open_season_number,rer.applications_open_month_number,rer.applications_open_day_number))<=v_today
      and coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number))>v_today
      and r.start_date::date>v_today;

    select count(*)::int,coalesce(jsonb_agg(x.item order by x.close_on,x.race_name),'[]'::jsonb)
    into v_closing_count,v_closing
    from (
      select r.name race_name,
        coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number)) close_on,
        jsonb_build_object('race_id',r.id,'race_name',r.name,'category',r.category,'start_date',r.start_date::date,
          'applications_close',coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number)),
          'days_until_close',coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number))-v_today) item
      from public.races r join public.race_entry_rules rer on rer.race_id=r.id
      where r.status='scheduled' and rer.applications_status='open'
        and coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number)) between v_today+1 and v_today+3
    ) x;

    select count(*)::int,coalesce(jsonb_agg(jsonb_build_object('race_id',r.id,'race_name',r.name,'status',e.status,'start_date',r.start_date::date) order by r.start_date,r.name),'[]'::jsonb)
    into v_pending_count,v_pending
    from public.race_team_entries e
    join public.clubs c on c.id=e.club_id
    join public.races r on r.id=e.race_id
    where c.owner_user_id=u.user_id and e.status in ('applied','under_review','provisionally_accepted') and r.start_date::date>v_today;

    if coalesce(v_open_count,0)+coalesce(v_pending_count,0)>0 then
      v_event_key:='race_application_daily:'||u.user_id::text||':'||v_today::text;
      perform public.upsert_user_daily_game_notification_v1(
        u.user_id,'RACE_APPLICATION_DAILY_UPDATE','Race applications update',
        format('%s application window%s open · %s closing within 3 days · %s application%s awaiting a decision.',
          coalesce(v_open_count,0),case when v_open_count=1 then '' else 's' end,coalesce(v_closing_count,0),coalesce(v_pending_count,0),case when v_pending_count=1 then '' else 's' end),
        '/dashboard/calendar',
        jsonb_build_object('game_date',v_today,'opened_or_open_count',v_open_count,'closing_soon_count',v_closing_count,'pending_count',v_pending_count,
          'open_races',v_open,'closing_soon_races',v_closing,'pending_applications',v_pending,
          'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Application%20are%20open.png'),
        v_event_key);
      v_created:=v_created+1;
    end if;
  end loop;
  return jsonb_build_object('success',true,'game_date',v_today,'daily_reports_checked_or_created',v_created);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_race_preparation_daily_report_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date:=public.get_current_game_date_date();
  u record; v_rows jsonb; v_total int; v_attention int; v_final int; v_open int; v_count int:=0;
begin
  for u in select distinct owner_user_id user_id from public.clubs where owner_user_id is not null and coalesce(club_type,'main')='main' and deleted_at is null loop
    with items as (
      select r.id race_id,r.name race_name,r.category,r.start_date::date start_date,
        coalesce(rp.rider_submission_deadline_on,
          public.make_game_rule_date_v1(nullif(to_jsonb(rer)->>'rider_submission_deadline_season_number','')::int,nullif(to_jsonb(rer)->>'rider_submission_deadline_month_number','')::int,nullif(to_jsonb(rer)->>'rider_submission_deadline_day_number','')::int),
          r.start_date::date-4) deadline,
        coalesce(rp.status,'draft') prep_status,
        case
          when coalesce(rp.status,'')='missed_startlist' then 'attention'
          when coalesce(rp.status,'')='submitted' then 'finalised'
          when coalesce(rp.rider_submission_deadline_on,r.start_date::date-4)<=v_today+2 then 'attention'
          else 'open' end report_state
      from public.race_team_entries e join public.clubs c on c.id=e.club_id join public.races r on r.id=e.race_id
      left join public.race_preparations rp on rp.race_id=r.id and (rp.club_id=e.club_id or rp.participating_club_id=e.club_id)
      left join public.race_entry_rules rer on rer.race_id=r.id
      where c.owner_user_id=u.user_id and e.status='accepted' and r.start_date::date>=v_today
        and v_today>=r.start_date::date-15
    )
    select count(*)::int,count(*) filter(where report_state='attention')::int,count(*) filter(where report_state='finalised')::int,count(*) filter(where report_state='open')::int,
      coalesce(jsonb_agg(jsonb_build_object('race_id',race_id,'race_name',race_name,'category',category,'start_date',start_date,'rider_deadline',deadline,'status',prep_status,'report_state',report_state)
        order by case report_state when 'attention' then 0 when 'open' then 1 else 2 end,start_date,race_name),'[]'::jsonb)
    into v_total,v_attention,v_final,v_open,v_rows from items;

    if coalesce(v_total,0)>0 then
      perform public.upsert_user_daily_game_notification_v1(u.user_id,'RACE_PREPARATION_DAILY_REPORT','Race preparation report',
        format('%s need attention · %s open/in progress · %s finalised.',coalesce(v_attention,0),coalesce(v_open,0),coalesce(v_final,0)),
        '/dashboard/race-preparation?tab=acceptedRaces',
        jsonb_build_object('game_date',v_today,'attention_count',v_attention,'open_count',v_open,'finalised_count',v_final,'races',v_rows,
          'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Plan%20needs%20Antention.png'),
        'race_preparation_daily:'||u.user_id::text||':'||v_today::text);
      v_count:=v_count+1;
    end if;
  end loop;
  return jsonb_build_object('success',true,'game_date',v_today,'daily_reports_checked_or_created',v_count);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_stage_planning_daily_report_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date:=public.get_current_game_date_date();
  u record; v_rows jsonb; v_total int; v_open int; v_soon int; v_locked int; v_missing int; v_count int:=0;
begin
  for u in select distinct owner_user_id user_id from public.clubs where owner_user_id is not null and coalesce(club_type,'main')='main' and deleted_at is null loop
    with base as (
      select r.id race_id,r.name race_name,r.category,rs.id stage_id,rs.stage_number,rs.name stage_name,rs.stage_date::date stage_date,
        rsp.id plan_id,coalesce(rsp.status,'missing') plan_status,
        coalesce(rsp.opens_on_game_date,rp.rider_submission_deadline_on,r.start_date::date-4) open_on,
        (rs.stage_date::timestamp + make_interval(hours=>coalesce(nullif(to_jsonb(rs)->>'planned_start_hour_number','')::int,r.planned_start_hour_number,9),mins=>coalesce(nullif(to_jsonb(rs)->>'planned_start_minute','')::int,r.planned_start_minute,30))-interval '3 hours') lock_at
      from public.race_team_entries e join public.clubs c on c.id=e.club_id join public.races r on r.id=e.race_id
      join public.race_stages rs on rs.race_id=r.id
      left join public.race_preparations rp on rp.race_id=r.id and (rp.club_id=e.club_id or rp.participating_club_id=e.club_id)
      left join public.race_stage_plans rsp on rsp.race_id=r.id and rsp.stage_id=rs.id and (rp.id is null or rsp.race_preparation_id=rp.id)
      where c.owner_user_id=u.user_id and e.status='accepted' and rs.stage_date::date between v_today-1 and v_today+30
    ), items as (
      select *,case
        when plan_id is null and lock_at::date<=v_today then 'missing_at_lock'
        when plan_status='locked' and (coalesce(locked_date,lock_at::date)>=v_today-1) then 'locked'
        when plan_status<>'locked' and lock_at::date between v_today and v_today+2 then 'lock_soon'
        when plan_status<>'locked' and v_today>=open_on and v_today<lock_at::date then 'open'
        else null end report_state
      from (select b.*, (select rsp2.locked_at::date from public.race_stage_plans rsp2 where rsp2.id=b.plan_id) locked_date from base b) q
    )
    select count(*)::int,count(*) filter(where report_state='open')::int,count(*) filter(where report_state='lock_soon')::int,
      count(*) filter(where report_state='locked')::int,count(*) filter(where report_state='missing_at_lock')::int,
      coalesce(jsonb_agg(jsonb_build_object('race_id',race_id,'race_name',race_name,'category',category,'stage_id',stage_id,'stage_number',stage_number,'stage_name',stage_name,
        'stage_date',stage_date,'plan_status',plan_status,'opens_on',open_on,'lock_at',lock_at,'report_state',report_state)
        order by case report_state when 'missing_at_lock' then 0 when 'lock_soon' then 1 when 'open' then 2 else 3 end,stage_date,race_name,stage_number)
        filter(where report_state is not null),'[]'::jsonb)
    into v_total,v_open,v_soon,v_locked,v_missing,v_rows from items where report_state is not null;

    if coalesce(v_total,0)>0 then
      perform public.upsert_user_daily_game_notification_v1(u.user_id,'STAGE_PLANNING_DAILY_REPORT','Stage planning report',
        format('%s missing at lock · %s lock soon · %s open · %s locked/recent.',coalesce(v_missing,0),coalesce(v_soon,0),coalesce(v_open,0),coalesce(v_locked,0)),
        '/dashboard/race-preparation?tab=stagePlans',
        jsonb_build_object('game_date',v_today,'missing_at_lock_count',v_missing,'lock_soon_count',v_soon,'open_count',v_open,'locked_count',v_locked,'stages',v_rows,
          'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Stage%20plan%20open.png'),
        'stage_planning_daily:'||u.user_id::text||':'||v_today::text);
      v_count:=v_count+1;
    end if;
  end loop;
  return jsonb_build_object('success',true,'game_date',v_today,'daily_reports_checked_or_created',v_count);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_rider_health_daily_report_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date:=public.get_current_game_date_date(); u record; v_events jsonb; v_current jsonb;
  v_inj int; v_sick int; v_nff int; v_fit int; v_issues int; v_count int:=0;
begin
  for u in select distinct owner_user_id user_id from public.clubs where owner_user_id is not null and coalesce(club_type,'main')='main' and deleted_at is null loop
    select count(*) filter(where l.event_code='rider_injured')::int,count(*) filter(where l.event_code='rider_sick')::int,
      count(*) filter(where l.event_code='rider_not_fully_fit')::int,count(*) filter(where l.event_code='rider_fit_again')::int,
      coalesce(jsonb_agg(jsonb_build_object('rider_id',l.rider_id,'rider_name',r.display_name,'event',l.event_code) order by l.created_at),'[]'::jsonb)
    into v_inj,v_sick,v_nff,v_fit,v_events
    from public.rider_status_notification_log l join public.riders r on r.id=l.rider_id
    where l.user_id=u.user_id and l.processed_date=v_today;

    select count(*)::int,coalesce(jsonb_agg(jsonb_build_object('rider_id',r.id,'rider_name',r.display_name,'status',r.availability_status,'fatigue',r.fatigue,
      'unavailable_until',r.unavailable_until,'unavailable_reason',r.unavailable_reason) order by r.display_name),'[]'::jsonb)
    into v_issues,v_current
    from public.riders r join public.club_riders cr on cr.rider_id=r.id join public.clubs c on c.id=cr.club_id
    where c.owner_user_id=u.user_id and c.deleted_at is null and coalesce(c.is_ai,false)=false and coalesce(c.club_type,'main')='main'
      and r.availability_status in ('injured','sick','not_fully_fit');

    if coalesce(v_inj,0)+coalesce(v_sick,0)+coalesce(v_nff,0)+coalesce(v_fit,0)+coalesce(v_issues,0)>0 then
      perform public.upsert_user_daily_game_notification_v1(u.user_id,'RIDER_HEALTH_DAILY_REPORT','Team medical report',
        format('%s injured · %s sick · %s not fully fit · %s recovered today. %s rider%s currently need medical/fitness attention.',
          coalesce(v_inj,0),coalesce(v_sick,0),coalesce(v_nff,0),coalesce(v_fit,0),coalesce(v_issues,0),case when v_issues=1 then '' else 's' end),
        '/dashboard/squad',jsonb_build_object('game_date',v_today,'injured_today',v_inj,'sick_today',v_sick,'not_fully_fit_today',v_nff,'recovered_today',v_fit,
          'current_issue_count',v_issues,'changes_today',v_events,'current_health_issues',v_current),
        'rider_health_daily:'||u.user_id::text||':'||v_today::text);
      v_count:=v_count+1;
    end if;
  end loop;
  return jsonb_build_object('success',true,'game_date',v_today,'daily_reports_checked_or_created',v_count);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notification_daily_summary_message_v1(p_type_code text, p_payload jsonb, p_fallback text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_code text := upper(coalesce(p_type_code,''));
  v_open int := coalesce(nullif(p_payload->>'opened_or_open_count','')::int, nullif(p_payload->>'open_count','')::int, 0);
  v_closing int := coalesce(nullif(p_payload->>'closing_soon_count','')::int, 0);
  v_pending int := coalesce(nullif(p_payload->>'pending_count','')::int, 0);
  v_attention int := coalesce(nullif(p_payload->>'attention_count','')::int, 0);
  v_finalised int := coalesce(nullif(p_payload->>'finalised_count','')::int, 0);
  v_missing int := coalesce(nullif(p_payload->>'missing_at_lock_count','')::int, 0);
  v_soon int := coalesce(nullif(p_payload->>'lock_soon_count','')::int, 0);
  v_locked int := coalesce(nullif(p_payload->>'locked_count','')::int, 0);
  v_injured int := coalesce(nullif(p_payload->>'injured_today','')::int, 0);
  v_sick int := coalesce(nullif(p_payload->>'sick_today','')::int, 0);
  v_nff int := coalesce(nullif(p_payload->>'not_fully_fit_today','')::int, 0);
  v_recovered int := coalesce(nullif(p_payload->>'recovered_today','')::int, 0);
  v_issues int := coalesce(nullif(p_payload->>'current_issue_count','')::int, 0);
  v_names text;
  v_attention_names text;
begin
  if v_code='RACE_APPLICATION_DAILY_UPDATE' then
    select string_agg(x.race_name, ', ')
      into v_names
    from (
      select nullif(trim(e->>'race_name'),'') as race_name
      from jsonb_array_elements(coalesce(p_payload->'closing_soon_races','[]'::jsonb)) e
      where nullif(trim(e->>'race_name'),'') is not null
      limit 5
    ) x;

    return format(
      '%s application window%s %s open. %s %s within 3 days%s. %s',
      v_open,
      case when v_open=1 then '' else 's' end,
      case when v_open=1 then 'is' else 'are' end,
      v_closing,
      case when v_closing=1 then 'closes' else 'close' end,
      case when coalesce(v_names,'')<>'' then ': '||v_names else '' end,
      case
        when v_pending=0 then 'No applications are awaiting a decision.'
        when v_pending=1 then '1 application is awaiting a decision.'
        else v_pending||' applications are awaiting a decision.'
      end
    );
  end if;

  if v_code='RACE_PREPARATION_DAILY_REPORT' then
    select string_agg(x.race_name, ', ')
      into v_attention_names
    from (
      select nullif(trim(e->>'race_name'),'') as race_name
      from jsonb_array_elements(coalesce(p_payload->'races','[]'::jsonb)) e
      where e->>'report_state'='attention'
        and nullif(trim(e->>'race_name'),'') is not null
      limit 4
    ) x;

    return format(
      '%s race%s %s attention%s. %s open/in progress. %s finalised.',
      v_attention,
      case when v_attention=1 then '' else 's' end,
      case when v_attention=1 then 'needs' else 'need' end,
      case when coalesce(v_attention_names,'')<>'' then ': '||v_attention_names else '' end,
      v_open,
      v_finalised
    );
  end if;

  if v_code='STAGE_PLANNING_DAILY_REPORT' then
    return format(
      '%s missing at lock. %s %s soon. %s open. %s locked/recent.',
      v_missing,
      v_soon,
      case when v_soon=1 then 'locks' else 'lock' end,
      v_open,
      v_locked
    );
  end if;

  if v_code='RIDER_HEALTH_DAILY_REPORT' then
    if v_injured+v_sick+v_nff+v_recovered+v_issues=0 then
      return 'No rider health or fitness issues require attention today.';
    end if;

    return format(
      '%s injured. %s sick. %s not fully fit. %s recovered today. %s rider%s currently need medical/fitness attention.',
      v_injured,
      v_sick,
      v_nff,
      v_recovered,
      v_issues,
      case when v_issues=1 then '' else 's' end
    );
  end if;

  return p_fallback;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enrich_sport_director_startlist_notification_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_type_code text;
  v_data jsonb;
  v_race_id uuid;
  v_club_id uuid;
  v_race_start date;
  v_race_end date;
  v_stage_date date;
  v_race_category text;
  v_next_future_race_id uuid;
  v_next_future_race_name text;
  v_next_future_race_start date;
  v_deadline_raw text;
  v_deadline_date date;
  v_deadline_display text;
begin
  if new.payload_json is null or jsonb_typeof(new.payload_json) <> 'object' then
    return new;
  end if;

  select nt.code into v_type_code
  from public.notification_types nt
  where nt.id = new.type_id;

  if v_type_code <> 'ADVISOR_SPORT_DIRECTOR_REPORT'
     or coalesce(new.payload_json ->> 'report_code', '') <> 'sd_startlist_deadline_alert' then
    return new;
  end if;

  v_data := coalesce(new.payload_json -> 'data', '{}'::jsonb);

  begin
    v_race_id := nullif(v_data ->> 'next_race_id', '')::uuid;
  exception when others then
    v_race_id := null;
  end;

  begin
    v_club_id := nullif(new.payload_json ->> 'club_id', '')::uuid;
  exception when others then
    v_club_id := null;
  end;

  if v_race_id is not null then
    select r.start_date::date, r.end_date::date, r.category
      into v_race_start, v_race_end, v_race_category
    from public.races r
    where r.id = v_race_id;

    select min(rs.stage_date)::date
      into v_stage_date
    from public.race_stages rs
    where rs.race_id = v_race_id;
  end if;

  if v_club_id is not null and v_race_start is not null then
    select r2.id, r2.name, r2.start_date::date
      into v_next_future_race_id, v_next_future_race_name, v_next_future_race_start
    from public.race_team_entries rte2
    join public.races r2 on r2.id = rte2.race_id
    where rte2.club_id = v_club_id
      and rte2.status = 'accepted'
      and r2.start_date::date > v_race_start
    order by r2.start_date::date, r2.name, r2.id
    limit 1;
  end if;

  v_deadline_raw := nullif(v_data ->> 'rider_submission_deadline_on', '');
  if v_deadline_raw ~ '^\d{4}-\d{2}-\d{2}' then
    begin
      v_deadline_date := substring(v_deadline_raw from 1 for 10)::date;
    exception when others then
      v_deadline_date := null;
    end;
  end if;

  if v_deadline_date is not null then
    v_deadline_display := public.staff_advisory_notification_game_date_label_v1(v_deadline_date);
    v_data := v_data
      || jsonb_build_object(
        'rider_submission_deadline_on_raw', v_deadline_date::text,
        'rider_submission_deadline_on', v_deadline_display
      );
    if new.message is not null then
      new.message := replace(new.message, v_deadline_raw, v_deadline_display);
    end if;
  end if;

  if v_race_start is not null then
    v_data := v_data || jsonb_build_object(
      'race_start_date_raw', v_race_start::text,
      'race_start_date', public.staff_advisory_notification_game_date_label_v1(v_race_start)
    );
  end if;

  if v_race_end is not null then
    v_data := v_data || jsonb_build_object(
      'race_end_date_raw', v_race_end::text,
      'race_end_date', public.staff_advisory_notification_game_date_label_v1(v_race_end)
    );
  end if;

  if v_stage_date is not null then
    v_data := v_data || jsonb_build_object(
      'stage_date_raw', v_stage_date::text,
      'stage_date', public.staff_advisory_notification_game_date_label_v1(v_stage_date)
    );
  end if;

  if v_race_category is not null then
    v_data := v_data || jsonb_build_object('race_category', v_race_category);
  end if;

  if v_next_future_race_start is not null then
    v_data := v_data || jsonb_build_object(
      'next_future_race_id', v_next_future_race_id,
      'next_future_race_name', v_next_future_race_name,
      'next_future_race_start_date_raw', v_next_future_race_start::text,
      'next_future_race_start_date', public.staff_advisory_notification_game_date_label_v1(v_next_future_race_start)
    );
  end if;

  new.payload_json := jsonb_set(new.payload_json, '{data}', v_data, true);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_universal_race_stage_replay_payload_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_state public.race_stage_automation_state%rowtype;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_calculation_due_game_at timestamp without time zone;
  v_output jsonb;
  v_replay_sync jsonb;
  v_replay_checkpoints jsonb;
  v_replay_closes_at_real timestamptz;
  v_results_published boolean := false;
  v_replay_window_elapsed boolean := false;
  v_results_visible boolean := false;
  v_speed_locked boolean := false;
begin
  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id = true;

  select stage.stage_date::timestamp
      + make_interval(
          hours => coalesce(stage.planned_start_hour_number, 12),
          mins => coalesce(stage.planned_start_minute, 0)
        )
  into v_stage_start_game_at
  from public.race_stages stage
  where stage.id = p_stage_id;

  if v_stage_start_game_at is null then
    return jsonb_build_object(
      'status', 'not_available',
      'reason', 'stage_not_found_or_unscheduled',
      'stage_id', p_stage_id
    );
  end if;

  v_calculation_due_game_at := v_stage_start_game_at
    - make_interval(hours => coalesce(v_control.typescript_calculation_lead_hours, 3));

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  select run.*
  into v_run
  from public.race_stage_simulation_runs run
  where run.stage_id = p_stage_id
    and run.status in ('running', 'completed')
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
    and coalesce(run.result_summary_json ->> 'calculation_contract', '') =
      'universal_phase11b_calculated_hidden_v1'
  order by run.updated_at desc, run.created_at desc, run.id desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'status', 'not_available',
      'reason', case
        when v_current_game_at < v_calculation_due_game_at
          then 'awaiting_calculation_window'
        else 'awaiting_backend_calculation'
      end,
      'stage_id', p_stage_id,
      'current_game_at', v_current_game_at,
      'calculation_due_game_at', v_calculation_due_game_at,
      'replay_opens_game_at', v_stage_start_game_at,
      'browser_calculation_allowed', false
    );
  end if;

  v_output := coalesce(
    v_run.result_summary_json -> 'output_snapshot',
    '{}'::jsonb
  );

  v_replay_sync := coalesce(
    v_output #> '{universalResult,replaySynchronization}',
    '{}'::jsonb
  );
  v_replay_checkpoints := coalesce(
    v_output #> '{universalResult,replayTimeline,checkpoints}',
    '[]'::jsonb
  );

  if coalesce((v_replay_sync ->> 'synchronized')::boolean, false) = false
     and jsonb_typeof(v_replay_checkpoints) = 'array'
     and jsonb_array_length(v_replay_checkpoints) >= 2
     and coalesce((v_replay_sync ->> 'allCheckpointRidersComplete')::boolean, false)
     and coalesce((v_replay_sync ->> 'allCheckpointsChronological')::boolean, false)
     and coalesce((v_replay_sync ->> 'allGapsMatchGroups')::boolean, false)
     and coalesce((v_replay_sync ->> 'allResultFieldsHiddenBeforeFinish')::boolean, false)
     and coalesce((v_replay_sync ->> 'finalCheckpointMatchesClassification')::boolean, false)
  then
    v_output := jsonb_set(
      v_output,
      '{universalResult,replayProgressGuarantee}',
      jsonb_build_object(
        'canProgress', true,
        'mode', 'degraded',
        'reason', 'non_blocking_synchronization_warnings',
        'issueCount', jsonb_array_length(
          coalesce(v_replay_sync -> 'issues', '[]'::jsonb)
        )
      ),
      true
    );
  end if;

  select *
  into v_state
  from public.race_stage_automation_state state
  where state.stage_id = p_stage_id;

  if v_current_game_at < v_stage_start_game_at then
    return jsonb_build_object(
      'status', 'not_open',
      'stage_id', p_stage_id,
      'calculated', true,
      'simulation_run_id', v_run.id,
      'replay_opens_game_at', v_stage_start_game_at,
      'results_visible', false,
      'browser_calculation_allowed', false
    );
  end if;

  v_replay_closes_at_real := nullif(v_state.details ->> 'replay_closes_at_real', '')::timestamptz;
  v_results_published :=
    coalesce((v_run.result_summary_json ->> 'results_published')::boolean, false)
    or v_run.status = 'completed'
    or coalesce(v_state.last_status, '') = 'published';
  v_replay_window_elapsed :=
    v_replay_closes_at_real is not null
    and now() >= v_replay_closes_at_real;
  v_results_visible := v_results_published or v_replay_window_elapsed;
  v_speed_locked :=
    not v_results_visible
    and coalesce(v_state.last_status, '') = 'replay_live'
    and v_replay_closes_at_real is not null
    and now() < v_replay_closes_at_real;

  return jsonb_build_object(
    'status', 'available',
    'stage_id', p_stage_id,
    'race_id', v_run.race_id,
    'simulation_run_id', v_run.id,
    'engine_version', v_output ->> 'engineVersion',
    'engine_key', v_output ->> 'engineKey',
    'database_engine_identity', v_run.engine_version,
    'database_simulation_mode', v_run.simulation_mode,
    'input_snapshot', v_run.input_snapshot_json,
    'output_snapshot', v_output,
    'lifecycle', jsonb_build_object(
      'replay_opened_game_at', v_stage_start_game_at,
      'replay_opened_at_real', v_state.details ->> 'replay_opened_at_real',
      'replay_closes_at_real', v_state.details ->> 'replay_closes_at_real',
      'results_visible', v_results_visible,
      'results_published_at', v_state.details ->> 'results_published_at_real',
      'speed_locked', v_speed_locked,
      'publication_pending', v_replay_window_elapsed and not v_results_published,
      'publication_error', v_state.last_error,
      'verification_only', false,
      'official_outputs_persisted', coalesce(
        (v_run.result_summary_json ->> 'official_outputs_persisted')::boolean,
        false
      ),
      'phase11_persistence_applied', coalesce(
        (v_run.result_summary_json ->> 'phase11_persistence_applied')::boolean,
        false
      ),
      'browser_calculation_allowed', false
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_merged_daily_notification_image_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_code text;
  v_image_url text;
begin
  select nt.code into v_code
  from public.notification_types nt
  where nt.id = new.type_id;

  v_image_url := case v_code
    when 'RACE_APPLICATION_DAILY_UPDATE' then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Application%20daily%20update.png'
    when 'RACE_PREPARATION_DAILY_REPORT' then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Preparation%20daily%20report.png'
    when 'STAGE_PLANNING_DAILY_REPORT' then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Stage%20Planning%20Daily%20Report.png'
    when 'RIDER_HEALTH_DAILY_REPORT' then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20health%20daily%20report.png'
    else null
  end;

  if v_image_url is not null then
    new.payload_json := jsonb_set(
      coalesce(new.payload_json, '{}'::jsonb),
      '{image_url}',
      to_jsonb(v_image_url),
      true
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_format_game_dates_in_text_v2(p_text text, p_current_game_date date)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result text := p_text;
  v_match text[];
  v_raw text;
  v_date date;
begin
  if p_text is null or btrim(p_text) = '' or p_current_game_date is null then
    return p_text;
  end if;

  for v_match in
    select regexp_matches(p_text, '([0-9]{4}-[0-9]{2}-[0-9]{2})', 'g')
  loop
    v_raw := v_match[1];
    begin
      v_date := v_raw::date;
    exception when others then
      continue;
    end;

    if abs(v_date - p_current_game_date) <= 400 then
      v_result := replace(
        v_result,
        v_raw,
        public.staff_advisory_notification_game_date_label_v1(v_date)
      );
    end if;
  end loop;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enrich_sport_director_notification_context_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_type_code text;
  v_report_code text;
  v_data jsonb;
  v_club_id uuid;
  v_race_id uuid;
  v_race_id_text text;
  v_stage_id uuid;
  v_stage_id_text text;
  v_current_game_date date;
  v_race_name text;
  v_race_start date;
  v_race_end date;
  v_race_category text;
  v_country_code text;
  v_host_city text;
  v_race_location text;
  v_prep_id uuid;
  v_prep_status text;
  v_startlist_status text;
  v_deadline date;
  v_stage_number integer;
  v_stage_date date;
  v_stage_start_label text;
  v_next_race_id uuid;
  v_next_race_name text;
  v_next_race_start date;
  v_management_count integer;
  v_missing_count integer := 0;
  v_problem_count integer := 0;
  v_summary text;
  v_recommendations jsonb;
  v_race_days integer;
begin
  select nt.code into v_type_code
  from public.notification_types nt
  where nt.id = new.type_id;

  if v_type_code <> 'ADVISOR_SPORT_DIRECTOR_REPORT' then
    return new;
  end if;

  v_report_code := coalesce(new.payload_json ->> 'report_code', '');
  v_data := coalesce(new.payload_json -> 'data', '{}'::jsonb);

  begin
    v_club_id := nullif(new.payload_json ->> 'club_id', '')::uuid;
  exception when others then
    v_club_id := null;
  end;

  begin
    if coalesce(v_data ->> 'current_game_date', '') ~ '^\d{4}-\d{2}-\d{2}$' then
      v_current_game_date := (v_data ->> 'current_game_date')::date;
    else
      v_current_game_date := null;
    end if;
  exception when others then
    v_current_game_date := null;
  end;

  v_race_id_text := coalesce(
    nullif(v_data ->> 'current_focus_race_id', ''),
    nullif(v_data ->> 'race_id', ''),
    nullif(v_data ->> 'next_race_id', ''),
    nullif(v_data ->> 'active_race_id', ''),
    nullif(v_data ->> 'next_future_race_id', '')
  );

  if v_race_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_race_id := v_race_id_text::uuid;
  end if;

  if v_race_id is not null then
    select r.name, r.start_date, r.end_date, r.category, r.country_code, r.host_city
      into v_race_name, v_race_start, v_race_end, v_race_category, v_country_code, v_host_city
    from public.races r
    where r.id = v_race_id;

    if v_race_name is not null then
      v_race_location := case
        when nullif(btrim(v_host_city), '') is not null and nullif(btrim(v_country_code), '') is not null
          then btrim(v_host_city) || ', ' || upper(btrim(v_country_code))
        when nullif(btrim(v_host_city), '') is not null then btrim(v_host_city)
        when nullif(btrim(v_country_code), '') is not null then upper(btrim(v_country_code))
        else null
      end;

      v_data := v_data || jsonb_strip_nulls(jsonb_build_object(
        'race_id', v_race_id,
        'race_name', v_race_name,
        'race_start_date', v_race_start,
        'race_end_date', v_race_end,
        'race_category', v_race_category,
        'country_code', v_country_code,
        'race_location', v_race_location
      ));

      if v_current_game_date is not null and v_race_start is not null then
        v_race_days := v_race_start - v_current_game_date;
        v_data := v_data || jsonb_build_object(
          'race_urgency',
          case
            when v_race_days < 0 and v_current_game_date <= coalesce(v_race_end, v_race_start) then 'active'
            when v_race_days < 0 then 'completed'
            when v_race_days = 0 then 'today'
            when v_race_days = 1 then 'tomorrow'
            else format('in %s days', v_race_days)
          end
        );
      end if;
    end if;

    if v_club_id is not null then
      select rp.id, rp.status, rp.startlist_status, rp.rider_submission_deadline_on
        into v_prep_id, v_prep_status, v_startlist_status, v_deadline
      from public.race_preparations rp
      where rp.race_id = v_race_id
        and (rp.club_id = v_club_id or rp.participating_club_id = v_club_id)
      order by rp.updated_at desc nulls last, rp.created_at desc nulls last
      limit 1;

      if v_prep_id is not null then
        v_data := v_data || jsonb_strip_nulls(jsonb_build_object(
          'race_preparation_id', v_prep_id,
          'race_preparation_status', v_prep_status,
          'preparation_status', v_prep_status,
          'startlist_status', v_startlist_status,
          'rider_submission_deadline_on', v_deadline
        ));
      end if;
    end if;

    v_stage_id_text := coalesce(
      nullif(v_data ->> 'stage_id', ''),
      nullif(v_data #>> '{next_missing_stage,stage_id}', ''),
      nullif(v_data #>> '{next_problem_stage,stage_id}', ''),
      nullif(v_data #>> '{missing_stage_details,0,stage_id}', ''),
      nullif(v_data #>> '{problem_stage_details,0,stage_id}', '')
    );

    if v_stage_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_stage_id := v_stage_id_text::uuid;
    end if;

    if v_stage_id is not null then
      select rs.stage_number, rs.stage_date, rs.planned_start_time_label
        into v_stage_number, v_stage_date, v_stage_start_label
      from public.race_stages rs
      where rs.id = v_stage_id;
    elsif v_report_code in (
      'sd_stage_plans_missing',
      'sd_stage_plans_incomplete',
      'sd_startlist_deadline_alert',
      'sd_race_preparation_missing',
      'sd_race_eligibility_critical'
    ) then
      select rs.id, rs.stage_number, rs.stage_date, rs.planned_start_time_label
        into v_stage_id, v_stage_number, v_stage_date, v_stage_start_label
      from public.race_stages rs
      where rs.race_id = v_race_id
      order by
        case when v_current_game_date is not null and rs.stage_date >= v_current_game_date then 0 else 1 end,
        rs.stage_date,
        rs.stage_number
      limit 1;
    end if;

    if v_stage_date is not null then
      v_data := v_data || jsonb_strip_nulls(jsonb_build_object(
        'stage_id', v_stage_id,
        'stage_number', v_stage_number,
        'stage_date', v_stage_date,
        'stage_start_time_label', v_stage_start_label
      ));
    end if;

    if v_club_id is not null and v_race_start is not null then
      select r2.id, r2.name, r2.start_date
        into v_next_race_id, v_next_race_name, v_next_race_start
      from public.race_team_entries rte2
      join public.races r2 on r2.id = rte2.race_id
      where rte2.club_id = v_club_id
        and rte2.status = 'accepted'
        and r2.id <> v_race_id
        and r2.start_date > coalesce(v_race_end, v_race_start)
      order by r2.start_date, r2.name, r2.id
      limit 1;

      if v_next_race_id is not null then
        v_data := v_data || jsonb_build_object(
          'next_future_race_id', v_next_race_id,
          'next_future_race_name', v_next_race_name,
          'next_future_race_start_date', v_next_race_start
        );
      else
        v_data := v_data
          - 'next_future_race_id'
          - 'next_future_race_name'
          - 'next_future_race_start_date';
      end if;
    end if;
  end if;

  if jsonb_typeof(v_data -> 'missing_stage_details') = 'array' then
    v_missing_count := jsonb_array_length(v_data -> 'missing_stage_details');
  elsif coalesce(v_data ->> 'actionable_missing_stage_plans', '') ~ '^\d+$' then
    v_missing_count := (v_data ->> 'actionable_missing_stage_plans')::integer;
  elsif coalesce(v_data ->> 'missing_stage_plans', '') ~ '^\d+$' then
    v_missing_count := (v_data ->> 'missing_stage_plans')::integer;
  end if;

  if jsonb_typeof(v_data -> 'problem_stage_details') = 'array' then
    v_problem_count := jsonb_array_length(v_data -> 'problem_stage_details');
  elsif coalesce(v_data ->> 'actionable_problem_stage_plans', '') ~ '^\d+$' then
    v_problem_count := (v_data ->> 'actionable_problem_stage_plans')::integer;
  elsif coalesce(v_data ->> 'problem_stage_plans', '') ~ '^\d+$' then
    v_problem_count := (v_data ->> 'problem_stage_plans')::integer;
  end if;

  if coalesce(v_data ->> 'management_priority_count', '') ~ '^\d+$' then
    v_management_count := (v_data ->> 'management_priority_count')::integer;
  elsif jsonb_typeof(new.payload_json -> 'management_priorities') = 'array' then
    v_management_count := jsonb_array_length(new.payload_json -> 'management_priorities');
  elsif v_report_code in ('sd_stage_plans_missing','sd_stage_plans_incomplete') then
    v_management_count := v_missing_count + v_problem_count;
  elsif v_report_code in ('sd_startlist_deadline_alert','sd_race_preparation_missing','sd_race_eligibility_critical','sd_race_programme_gap') then
    v_management_count := 1;
  else
    v_management_count := 0;
  end if;

  v_data := v_data || jsonb_build_object('management_priority_count', v_management_count);

  new.payload_json := jsonb_set(
    coalesce(new.payload_json, '{}'::jsonb),
    '{data}',
    v_data,
    true
  );

  v_summary := nullif(new.payload_json ->> 'summary', '');
  if v_summary is not null then
    v_summary := public.staff_advisory_format_game_dates_in_text_v2(v_summary, v_current_game_date);
    new.payload_json := jsonb_set(new.payload_json, '{summary}', to_jsonb(v_summary), true);
    new.message := v_summary;
  end if;

  if jsonb_typeof(new.payload_json -> 'recommendations') = 'array' then
    select jsonb_agg(
      to_jsonb(public.staff_advisory_format_game_dates_in_text_v2(value, v_current_game_date))
      order by ord
    )
    into v_recommendations
    from jsonb_array_elements_text(new.payload_json -> 'recommendations') with ordinality as x(value, ord);

    if v_recommendations is not null then
      new.payload_json := jsonb_set(new.payload_json, '{recommendations}', v_recommendations, true);
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_sport_director_notification_display_context_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_type_code text;
  v_report_code text;
  v_data jsonb;
  v_prep_status text;
  v_startlist_status text;
begin
  select nt.code into v_type_code
  from public.notification_types nt
  where nt.id = new.type_id;

  if v_type_code <> 'ADVISOR_SPORT_DIRECTOR_REPORT' then
    return new;
  end if;

  v_report_code := coalesce(new.payload_json ->> 'report_code', '');
  v_data := coalesce(new.payload_json -> 'data', '{}'::jsonb);

  v_prep_status := nullif(v_data ->> 'race_preparation_status', '');
  if v_prep_status = 'submitted' then
    v_data := v_data || jsonb_build_object(
      'race_preparation_status_raw', 'submitted',
      'preparation_status_raw', coalesce(nullif(v_data ->> 'preparation_status', ''), 'submitted'),
      'race_preparation_status', 'ready',
      'preparation_status', 'ready'
    );
  end if;

  v_startlist_status := nullif(v_data ->> 'startlist_status', '');
  if v_startlist_status = 'submitted' then
    v_data := v_data || jsonb_build_object(
      'startlist_status_raw', 'submitted',
      'startlist_status', 'ready'
    );
  end if;

  if nullif(v_data ->> 'next_future_race_id', '') is null then
    v_data := v_data || jsonb_build_object(
      'next_future_race_name', 'None scheduled',
      'next_future_race_start_date', 'Not scheduled'
    );
  end if;

  if v_report_code = 'sd_race_programme_gap'
     and nullif(v_data ->> 'race_id', '') is null then
    v_data := v_data || jsonb_build_object(
      'race_name', 'No accepted race',
      'race_start_date', 'Not scheduled',
      'race_end_date', 'Not scheduled',
      'race_location', 'Not scheduled',
      'rider_submission_deadline_on', 'Not scheduled',
      'stage_date', 'Not applicable'
    );
  end if;

  new.payload_json := jsonb_set(
    coalesce(new.payload_json, '{}'::jsonb),
    '{data}',
    v_data,
    true
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.invalidate_race_startlist_captain_finalization_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race_id uuid;
begin
  v_race_id := coalesce(new.race_id, old.race_id);
  if v_race_id is null then
    return coalesce(new, old);
  end if;

  update public.races r
  set metadata =
        (coalesce(r.metadata, '{}'::jsonb)
          - 'race_startlist_captains_finalized_at'
          - 'race_startlist_captain_model_version')
        || jsonb_build_object(
             'race_startlist_captains_finalized', false,
             'captains_pending_rider_deadline', true,
             'captain_finalization_invalidated_at', clock_timestamp(),
             'captain_finalization_invalidation_source', tg_table_name
           ),
      updated_at = clock_timestamp()
  where r.id = v_race_id
    and lower(coalesce(r.metadata->>'race_startlist_captains_finalized','false')) in ('true','1','yes')
    and r.status in ('scheduled','active')
    and not exists (
      select 1
      from public.race_stages s
      join public.race_stage_authoritative_runs a on a.stage_id=s.id
      where s.race_id=v_race_id
    )
    and not exists (
      select 1
      from public.race_stages s
      join public.race_stage_results rr on rr.stage_id=s.id
      where s.race_id=v_race_id
    )
    and not exists (
      select 1
      from public.race_stages s
      join public.race_stage_simulation_runs sr on sr.stage_id=s.id
      where s.race_id=v_race_id
        and sr.status in ('running','completed')
    );

  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_startlist_engine_self_heal_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_readiness_before jsonb;
  v_readiness_after jsonb;
  v_team_list_repair jsonb := null;
  v_hierarchy_fill jsonb := null;
  v_startlist_repair jsonb := null;
  v_current_game_at timestamp without time zone;
  v_rider_deadline timestamp without time zone;
  v_team_list_attempted boolean := false;
  v_hierarchy_fill_attempted boolean := false;
  v_startlist_attempted boolean := false;
  v_team_list_error text := null;
  v_hierarchy_fill_error text := null;
  v_startlist_error text := null;
begin
  if p_race_id is null then
    return jsonb_build_object(
      'ready',false,
      'reason','race_id_required',
      'readiness_before',jsonb_build_object('ready',false,'reason','race_id_required'),
      'readiness_after',jsonb_build_object('ready',false,'reason','race_id_required')
    );
  end if;

  v_current_game_at := public.get_current_game_timestamp()::timestamp without time zone;
  v_readiness_before := public.race_startlist_engine_readiness_v1(p_race_id);
  v_readiness_after := v_readiness_before;

  if coalesce((v_readiness_after->>'ready')::boolean,false) is not true
     and coalesce(v_readiness_after->>'reason','')='team_list_not_finalized'
  then
    v_team_list_attempted := true;
    begin
      v_team_list_repair := public.finalize_race_team_list_announcement_v1(p_race_id);
    exception when others then
      v_team_list_error := sqlstate || ': ' || sqlerrm;
    end;
    v_readiness_after := public.race_startlist_engine_readiness_v1(p_race_id);
  end if;

  begin
    v_rider_deadline :=
      nullif(v_readiness_after->>'rider_deadline_game_at','')::timestamp without time zone;
  exception when others then
    v_rider_deadline := null;
  end;

  /*
   * A short field is not an "unfillable-team" problem. Explicitly add teams
   * using the universal hierarchy before trying to finalize captains/numbers.
   */
  if coalesce((v_readiness_after->>'ready')::boolean,false) is not true
     and coalesce(v_readiness_after->>'reason','')='insufficient_eligible_teams'
     and (v_rider_deadline is null or v_current_game_at >= v_rider_deadline)
  then
    v_hierarchy_fill_attempted := true;
    begin
      v_hierarchy_fill := public.fill_race_ai_teams_v1(p_race_id);
    exception when others then
      v_hierarchy_fill_error := sqlstate || ': ' || sqlerrm;
    end;
    v_readiness_after := public.race_startlist_engine_readiness_v1(p_race_id);
  end if;

  /*
   * Once the rider deadline has passed, repair any remaining snapshots,
   * numbers, captain assignments or unfillable AI teams.
   */
  if coalesce((v_readiness_after->>'ready')::boolean,false) is not true
     and coalesce(v_readiness_after->>'reason','') not in (
       'rider_deadline_not_reached',
       'race_or_entry_rules_not_found',
       'race_id_required'
     )
     and (v_rider_deadline is null or v_current_game_at >= v_rider_deadline)
  then
    v_startlist_attempted := true;
    begin
      v_startlist_repair := public.finalize_race_startlist_captains_v1(p_race_id);
    exception when others then
      v_startlist_error := sqlstate || ': ' || sqlerrm;
    end;
    v_readiness_after := public.race_startlist_engine_readiness_v1(p_race_id);
  end if;

  return jsonb_build_object(
    'race_id',p_race_id,
    'ready',coalesce((v_readiness_after->>'ready')::boolean,false),
    'reason',coalesce(v_readiness_after->>'reason','unknown'),
    'current_game_at',v_current_game_at,
    'rider_deadline_game_at',v_rider_deadline,
    'readiness_before',v_readiness_before,
    'readiness_after',v_readiness_after,
    'team_list_repair_attempted',v_team_list_attempted,
    'team_list_repair_result',v_team_list_repair,
    'team_list_repair_error',v_team_list_error,
    'hierarchy_fill_attempted',v_hierarchy_fill_attempted,
    'hierarchy_fill_result',v_hierarchy_fill,
    'hierarchy_fill_error',v_hierarchy_fill_error,
    'startlist_repair_attempted',v_startlist_attempted,
    'startlist_repair_result',v_startlist_repair,
    'startlist_repair_error',v_startlist_error,
    'self_heal_model','team_shortage_hierarchy_v2'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_due_stage_watchdog_run_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_now timestamp without time zone := public.get_current_game_timestamp()::timestamp without time zone;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_stage record;
  v_before jsonb;
  v_after jsonb;
  v_repair jsonb;
  v_consistency jsonb;
  v_team_finalize jsonb;
  v_captain_finalize jsonb;
  v_ready boolean;
  v_checked integer := 0;
  v_repaired integer := 0;
  v_blocked integer := 0;
begin
  select * into v_control from public.race_engine_runtime_control_v1 where singleton_id=true;
  if not found or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled');
  end if;

  /* First make sure all globally due rider deadlines have been processed. */
  begin
    perform public.process_due_race_startlist_deadlines_v1();
  exception when others then
    null;
  end;

  for v_stage in
    select
      s.id as stage_id,
      s.race_id,
      r.name as race_name,
      s.stage_number,
      public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone as stage_start_game_at,
      public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3)) as calculation_due_game_at
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where not coalesce(s.weather_cancelled,false)
      and public.race_stage_planned_start_game_at_v1(s.id) is not null
      and (public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone) >= v_control.typescript_activation_game_at
      and (public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3))) <= v_now
      and not exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.id)
      and not exists (
        select 1 from public.race_stage_simulation_runs sr
        where sr.stage_id=s.id
          and sr.engine_version='race_engine_ts_v1'
          and sr.simulation_mode='deterministic_road_race_v1'
          and sr.status in ('running','completed')
          and coalesce(sr.result_summary_json->>'calculation_contract','') in ('phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1')
      )
    order by
      case when (public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone) <= v_now then 0 else 1 end,
      public.race_stage_planned_start_game_at_v1(s.id), s.race_id, s.stage_number
    limit 200
  loop
    v_checked := v_checked + 1;
    v_before := public.race_startlist_engine_readiness_v1(v_stage.race_id);
    v_after := v_before;
    v_repair := '{}'::jsonb;
    v_consistency := '{}'::jsonb;
    v_team_finalize := '{}'::jsonb;
    v_captain_finalize := '{}'::jsonb;

    if not coalesce((v_after->>'ready')::boolean,false) then
      begin
        v_repair := public.race_startlist_engine_self_heal_v1(v_stage.race_id);
      exception when others then
        v_repair := jsonb_build_object('status','error','sqlstate',sqlstate,'message',sqlerrm);
      end;
      v_after := public.race_startlist_engine_readiness_v1(v_stage.race_id);
    end if;

    /* Stronger canonical repair once a stage is due and ordinary self-heal was insufficient. */
    if not coalesce((v_after->>'ready')::boolean,false) then
      begin
        v_consistency := public.repair_race_startlist_consistency_v1(v_stage.race_id);
      exception when others then
        v_consistency := jsonb_build_object('status','error','sqlstate',sqlstate,'message',sqlerrm);
      end;

      if coalesce(v_after->>'reason','')='team_list_not_finalized' then
        begin
          v_team_finalize := public.finalize_race_team_list_announcement_v1(v_stage.race_id);
        exception when others then
          v_team_finalize := jsonb_build_object('status','error','sqlstate',sqlstate,'message',sqlerrm);
        end;
      end if;

      begin
        v_captain_finalize := public.finalize_race_startlist_captains_v1(v_stage.race_id);
      exception when others then
        v_captain_finalize := jsonb_build_object('status','error','sqlstate',sqlstate,'message',sqlerrm);
      end;

      v_after := public.race_startlist_engine_readiness_v1(v_stage.race_id);
    end if;

    v_ready := coalesce((v_after->>'ready')::boolean,false);
    if v_ready and not coalesce((v_before->>'ready')::boolean,false) then
      v_repaired := v_repaired + 1;
    end if;
    if not v_ready then
      v_blocked := v_blocked + 1;
    end if;

    insert into public.race_engine_due_stage_watchdog_v1(
      stage_id,race_id,stage_start_game_at,calculation_due_game_at,last_checked_game_at,
      ready,reason,readiness,repair_result,first_blocked_at,last_blocked_at,blocked_check_count,updated_at
    ) values (
      v_stage.stage_id,v_stage.race_id,v_stage.stage_start_game_at,v_stage.calculation_due_game_at,v_now,
      v_ready,coalesce(v_after->>'reason','unknown'),v_after,
      jsonb_build_object('self_heal',v_repair,'consistency',v_consistency,'team_finalize',v_team_finalize,'captain_finalize',v_captain_finalize),
      case when v_ready then null else now() end,
      case when v_ready then null else now() end,
      case when v_ready then 0 else 1 end,
      now()
    )
    on conflict(stage_id) do update set
      race_id=excluded.race_id,
      stage_start_game_at=excluded.stage_start_game_at,
      calculation_due_game_at=excluded.calculation_due_game_at,
      last_checked_game_at=excluded.last_checked_game_at,
      ready=excluded.ready,
      reason=excluded.reason,
      readiness=excluded.readiness,
      repair_result=excluded.repair_result,
      first_blocked_at=case
        when excluded.ready then public.race_engine_due_stage_watchdog_v1.first_blocked_at
        else coalesce(public.race_engine_due_stage_watchdog_v1.first_blocked_at, now())
      end,
      last_blocked_at=case when excluded.ready then public.race_engine_due_stage_watchdog_v1.last_blocked_at else now() end,
      blocked_check_count=case when excluded.ready then public.race_engine_due_stage_watchdog_v1.blocked_check_count else public.race_engine_due_stage_watchdog_v1.blocked_check_count+1 end,
      updated_at=now();
  end loop;

  return jsonb_build_object(
    'status','completed',
    'current_game_at',v_now,
    'checked',v_checked,
    'repaired',v_repaired,
    'blocked',v_blocked
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_survival_mode_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage record;
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_prior_failed_attempts integer := 0;
  v_authoritative_exists boolean := false;
  v_deadline_reached boolean := false;
  v_latest_failed_id uuid;
  v_latest_error_message text;
  v_latest_result_summary jsonb := '{}'::jsonb;
begin
  select s.id as stage_id,s.race_id,s.stage_date,
         s.planned_start_hour_number,s.planned_start_minute
    into v_stage
  from public.race_stages s
  where s.id=p_stage_id;

  if not found then
    return jsonb_build_object(
      'status','stage_not_found',
      'stage_id',p_stage_id,
      'use_fallback',false,
      'primary_required',false,
      'recovery_policy','same_full_input_or_quarantine_v1'
    );
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone
    into v_current_game_at;

  v_stage_start_game_at := v_stage.stage_date::timestamp
    + make_interval(
        hours=>coalesce(v_stage.planned_start_hour_number,12),
        mins=>coalesce(v_stage.planned_start_minute,0)
      );

  select count(*)::integer
    into v_prior_failed_attempts
  from public.race_stage_simulation_runs sr
  where sr.stage_id=p_stage_id
    and sr.engine_version='race_engine_ts_v1'
    and sr.simulation_mode='deterministic_road_race_v1'
    and sr.status='failed';

  select sr.id,sr.error_message,coalesce(sr.result_summary_json,'{}'::jsonb)
    into v_latest_failed_id,v_latest_error_message,v_latest_result_summary
  from public.race_stage_simulation_runs sr
  where sr.stage_id=p_stage_id
    and sr.engine_version='race_engine_ts_v1'
    and sr.simulation_mode='deterministic_road_race_v1'
    and sr.status='failed'
  order by coalesce(sr.failed_at,sr.updated_at,sr.created_at) desc
  limit 1;

  select exists(
    select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id
  ) into v_authoritative_exists;

  v_deadline_reached :=
    v_current_game_at >= v_stage_start_game_at - interval '15 minutes';

  return jsonb_build_object(
    'status','resolved',
    'stage_id',p_stage_id,
    'race_id',v_stage.race_id,
    'current_game_at',v_current_game_at,
    'stage_start_game_at',v_stage_start_game_at,
    'mandatory_ready_deadline_game_at',v_stage_start_game_at-interval '15 minutes',
    'deadline_reached',v_deadline_reached,
    'prior_failed_attempts',v_prior_failed_attempts,
    'latest_failed_simulation_run_id',v_latest_failed_id,
    'latest_failed_survival_phase',nullif(v_latest_result_summary->>'survival_phase',''),
    'latest_failed_reason',coalesce(
      nullif(v_latest_result_summary#>>'{error_details,reason}',''),
      nullif(v_latest_error_message,'')
    ),
    'authoritative_exists',v_authoritative_exists,
    'primary_required',not v_authoritative_exists,
    'retry_with_primary',not v_authoritative_exists and v_prior_failed_attempts>0,
    'emergency_fallback_allowed_after_current_primary_failure',false,
    'use_fallback',false,
    'scenario_must_be_preserved',true,
    'recovery_policy','same_full_input_or_quarantine_v1',
    'fallback_reason',case
      when v_authoritative_exists then 'authoritative_result_exists'
      when v_prior_failed_attempts>0 then 'retry_same_full_input_or_new_seed'
      when v_deadline_reached then 'primary_required_at_mandatory_deadline'
      else 'normal_engine_first_attempt'
    end,
    'model_version','race_calculation_survival_primary_retry_v5_same_full_input'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_survival_recover_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current_game_at timestamp without time zone;
  v_run record;
  v_stage_start_game_at timestamp without time zone;
  v_deadline_reached boolean;
  v_stale_after interval;
  v_age interval;
  v_absolute_age interval;
  v_phase text;
  v_recovered integer := 0;
  v_checked integer := 0;
  v_hard_expired integer := 0;
begin
  select public.get_current_game_timestamp()::timestamp without time zone
    into v_current_game_at;

  for v_run in
    select sr.id as simulation_run_id,
           sr.stage_id,
           sr.race_id,
           sr.started_at,
           sr.updated_at,
           sr.created_at,
           coalesce(nullif(sr.result_summary_json->>'survival_phase',''),'claimed') as survival_phase,
           s.stage_date,
           s.planned_start_hour_number,
           s.planned_start_minute
    from public.race_stage_simulation_runs sr
    join public.race_stages s on s.id=sr.stage_id
    where sr.engine_version='race_engine_ts_v1'
      and sr.simulation_mode='deterministic_road_race_v1'
      and sr.status='running'
      and (
        coalesce(sr.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
        or (
          coalesce(sr.result_summary_json->>'calculation_contract','')=''
          and coalesce(sr.result_summary_json->>'phase11b_contract','')='universal_production_engine_v2'
          and coalesce(sr.result_summary_json->>'support_contract','')='supabase_race_calculation_survival_v1'
        )
      )
      and not exists (
        select 1 from public.race_stage_authoritative_runs a where a.stage_id=sr.stage_id
      )
    order by coalesce(sr.updated_at,sr.started_at,sr.created_at)
    limit 200
  loop
    v_checked := v_checked + 1;
    v_stage_start_game_at := v_run.stage_date::timestamp
      + make_interval(hours=>coalesce(v_run.planned_start_hour_number,12),
                      mins=>coalesce(v_run.planned_start_minute,0));
    v_deadline_reached := v_current_game_at >= v_stage_start_game_at - interval '15 minutes';
    v_phase := coalesce(nullif(v_run.survival_phase,''),'claimed');

    v_stale_after := case
      when v_phase in ('primary_engine_started','fallback_engine_started') then interval '8 minutes'
      when v_phase in ('pass1_resume_claimed','pass1_payload_loading','pass1_started',
                       'pass2_resume_claimed','pass2_payload_loading') then interval '4 minutes'
      when v_phase in ('primary_engine_finished','fallback_engine_finished','output_ready','submitting','scenario_reserved') then interval '3 minutes'
      when v_phase in ('claimed','payload_loading','payload_loaded','pass1_pending','pass1_ready_no_scenario') then interval '5 minutes'
      else interval '5 minutes'
    end;

    v_age := clock_timestamp() - coalesce(v_run.updated_at,v_run.started_at,v_run.created_at);
    v_absolute_age := clock_timestamp() - coalesce(v_run.started_at,v_run.created_at);

    -- Hard wall-clock circuit breaker. Heartbeats prove liveness, not progress.
    -- A repeatedly restarted Edge worker must never be able to own the global
    -- race-calculation lane forever.
    if v_absolute_age >= interval '15 minutes' then
      perform public.universal_race_stage_fail_calculation_v1(
        v_run.stage_id,
        v_run.simulation_run_id,
        'Race calculation exceeded the hard 15-minute wall-clock runtime limit.',
        jsonb_build_object(
          'recovery_model','race_calculation_hard_runtime_guard_v1',
          'reason','hard_wall_clock_runtime_limit_exceeded',
          'survival_phase',v_phase,
          'absolute_age_seconds',extract(epoch from v_absolute_age),
          'hard_limit_seconds',900,
          'heartbeat_age_seconds',extract(epoch from v_age),
          'deadline_reached',v_deadline_reached,
          'current_game_at',v_current_game_at,
          'stage_start_game_at',v_stage_start_game_at
        )
      );

      insert into public.race_engine_calculation_survival_audit_v1(
        stage_id,race_id,simulation_run_id,action,reason,details
      ) values (
        v_run.stage_id,
        v_run.race_id,
        v_run.simulation_run_id,
        'recover_hard_runtime_limit',
        'hard_wall_clock_runtime_limit_exceeded',
        jsonb_build_object(
          'survival_phase',v_phase,
          'absolute_age_seconds',extract(epoch from v_absolute_age),
          'hard_limit_seconds',900,
          'heartbeat_age_seconds',extract(epoch from v_age),
          'deadline_reached',v_deadline_reached,
          'current_game_at',v_current_game_at,
          'stage_start_game_at',v_stage_start_game_at
        )
      );

      v_recovered := v_recovered + 1;
      v_hard_expired := v_hard_expired + 1;
      continue;
    end if;

    if v_age >= v_stale_after then
      perform public.universal_race_stage_fail_calculation_v1(
        v_run.stage_id,
        v_run.simulation_run_id,
        'Race calculation survival watchdog recovered an expired calculation lease.',
        jsonb_build_object(
          'recovery_model','race_calculation_survival_phase_aware_lease_v2',
          'reason','expired_phase_aware_calculation_lease_without_authoritative_result',
          'survival_phase',v_phase,
          'stale_age_seconds',extract(epoch from v_age),
          'stale_threshold_seconds',extract(epoch from v_stale_after),
          'deadline_reached',v_deadline_reached,
          'current_game_at',v_current_game_at,
          'stage_start_game_at',v_stage_start_game_at,
          'mandatory_ready_deadline_game_at',v_stage_start_game_at - interval '15 minutes'
        )
      );

      insert into public.race_engine_calculation_survival_audit_v1(
        stage_id,race_id,simulation_run_id,action,reason,details
      ) values (
        v_run.stage_id,
        v_run.race_id,
        v_run.simulation_run_id,
        'recover_expired_phase_lease',
        'expired_phase_aware_calculation_lease_without_authoritative_result',
        jsonb_build_object(
          'survival_phase',v_phase,
          'stale_age_seconds',extract(epoch from v_age),
          'stale_threshold_seconds',extract(epoch from v_stale_after),
          'deadline_reached',v_deadline_reached,
          'current_game_at',v_current_game_at,
          'stage_start_game_at',v_stage_start_game_at
        )
      );
      begin
        perform net.http_post(
          url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-pass2-resume',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-universal-race-worker-secret',(
              select decrypted_secret
              from vault.decrypted_secrets
              where name='universal_race_worker_secret_v1'
              limit 1
            )
          ),
          body := '{"action":"tick"}'::jsonb,
          timeout_milliseconds := 30000
        );
      exception when others then
        null;
      end;
      v_recovered := v_recovered + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'status','completed',
    'current_game_at',v_current_game_at,
    'checked_running_claims',v_checked,
    'recovered_stale_claims',v_recovered,
    'hard_runtime_expirations',v_hard_expired,
    'hard_runtime_limit_seconds',900,
    'claimed_or_payload_lease_seconds',240,
    'engine_lease_seconds',480,
    'post_engine_lease_seconds',180,
    'mandatory_ready_lead_minutes',15,
    'deadline_shortening_disabled',true,
    'model_version','race_calculation_survival_phase_aware_lease_v4_hard_runtime_guard'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_survival_heartbeat_v1(p_stage_id uuid, p_simulation_run_id uuid, p_phase text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_updated integer := 0;
begin
  update public.race_stage_simulation_runs sr
  set updated_at=clock_timestamp(),
      result_summary_json=coalesce(sr.result_summary_json,'{}'::jsonb) || jsonb_build_object(
        'survival_phase',coalesce(nullif(p_phase,''),'unknown'),
        'survival_heartbeat_at_real',clock_timestamp(),
        'survival_details',coalesce(p_details,'{}'::jsonb)
      )
  where sr.id=p_simulation_run_id
    and sr.stage_id=p_stage_id
    and sr.engine_version='race_engine_ts_v1'
    and sr.simulation_mode='deterministic_road_race_v1'
    and sr.status='running'
    and coalesce(sr.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
    and not exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id);
  get diagnostics v_updated=row_count;

  if v_updated > 0 then
    update public.race_stage_automation_state st
    set last_checked_at=clock_timestamp(),
        details=coalesce(st.details,'{}'::jsonb) || jsonb_build_object(
          'survival_phase',coalesce(nullif(p_phase,''),'unknown'),
          'survival_heartbeat_at_real',clock_timestamp(),
          'survival_details',coalesce(p_details,'{}'::jsonb)
        ),
        updated_at=clock_timestamp()
    where st.stage_id=p_stage_id and st.simulation_run_id=p_simulation_run_id;
  end if;

  return jsonb_build_object(
    'status',case when v_updated>0 then 'heartbeat_recorded' else 'heartbeat_not_recorded' end,
    'stage_id',p_stage_id,
    'simulation_run_id',p_simulation_run_id,
    'phase',coalesce(nullif(p_phase,''),'unknown'),
    'updated_rows',v_updated,
    'model_version','race_calculation_survival_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_finalize_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_reveal_game_at timestamp without time zone;
begin
  select public.get_current_game_timestamp()::timestamp without time zone,
         public.race_stage_planned_start_game_at_v1(p_stage_id)::timestamp without time zone
    into v_current_game_at, v_stage_start_game_at;

  if v_stage_start_game_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'race_stage_publication_blocked_missing_canonical_start';
  end if;

  v_reveal_game_at := v_stage_start_game_at + interval '30 minutes';

  if v_current_game_at < v_reveal_game_at then
    return jsonb_build_object(
      'status','deferred_not_before_reveal',
      'stage_id',p_stage_id,
      'current_game_at',v_current_game_at,
      'stage_start_game_at',v_stage_start_game_at,
      'official_results_reveal_game_at',v_reveal_game_at,
      'official_outputs_persisted',false,
      'guard_model','canonical_start_plus_30_hard_gate_v2'
    );
  end if;

  begin
    return public.universal_race_stage_finalize_core_survival_v1(p_stage_id);
  exception
    when query_canceled then
      raise exception using
        errcode = 'P0001',
        message = 'race_stage_publication_deferred_after_statement_timeout';
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_retry_due_publications_v1(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_state record;
  v_result jsonb;
  v_checked integer := 0;
  v_published integer := 0;
  v_failed integer := 0;
  v_publications jsonb := '[]'::jsonb;
  v_failures jsonb := '[]'::jsonb;
  v_sqlstate text;
  v_error text;
  v_current_game_at timestamp without time zone;
begin
  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;
  for v_state in
    select state.stage_id, state.simulation_run_id
    from public.race_stage_automation_state state
    where state.last_status = 'replay_live'
      and nullif(state.details ->> 'replay_closes_at_real', '') is not null
      and (state.details ->> 'replay_closes_at_real')::timestamptz <= clock_timestamp()
      and public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone
            + interval '30 minutes' <= v_current_game_at
    order by (state.details ->> 'replay_closes_at_real')::timestamptz, state.stage_id
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  loop
    v_checked := v_checked + 1;

    begin
      v_result := public.universal_race_stage_finalize_v1(v_state.stage_id);
      v_published := v_published + 1;
      v_publications := v_publications || jsonb_build_array(v_result);
    exception when others then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_error = message_text;

      update public.race_stage_automation_state
      set last_checked_at = clock_timestamp(),
          last_error = left(
            format('Publication retry failed [%s]: %s', v_sqlstate, v_error),
            2000
          ),
          details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
            'publication_pending', true,
            'publication_retry_failed_at_real', clock_timestamp(),
            'publication_retry_sqlstate', v_sqlstate,
            'publication_retry_error', left(v_error, 1500)
          ),
          updated_at = clock_timestamp()
      where stage_id = v_state.stage_id;

      v_failed := v_failed + 1;
      v_failures := v_failures || jsonb_build_array(jsonb_build_object(
        'stage_id', v_state.stage_id,
        'simulation_run_id', v_state.simulation_run_id,
        'sqlstate', v_sqlstate,
        'error', left(v_error, 1500)
      ));
    end;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'checked', v_checked,
    'published', v_published,
    'failed', v_failed,
    'publications', v_publications,
    'failures', v_failures,
    'model_version', 'universal_race_publication_retry_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_car_recent_races_v1(p_team_car_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(race_id uuid, race_name text, category text, race_type text, country_code text, first_used_game_date date, last_used_game_date date, stages_used integer, distance_km numeric, condition_loss numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid;
  v_club_id uuid;
  v_limit integer;
begin
  v_uid := coalesce(auth.uid(), nullif(current_setting('request.jwt.claim.sub', true), '')::uuid);
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select ctc.club_id
  into v_club_id
  from public.club_team_cars ctc
  where ctc.id = p_team_car_id
    and ctc.status <> 'sold';

  if v_club_id is null then
    raise exception 'Team Car not found';
  end if;

  if not exists (
    select 1
    from public.clubs c
    left join public.club_memberships cm
      on cm.club_id = c.id
     and cm.user_id = v_uid
    where c.id = v_club_id
      and (c.owner_user_id = v_uid or cm.user_id is not null)
  ) then
    raise exception 'Not allowed to view Team Car race history';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 5), 10));

  return query
  select
    w.race_id,
    r.name::text,
    r.category::text,
    r.race_type::text,
    r.country_code::text,
    min(w.applied_game_date)::date,
    max(w.applied_game_date)::date,
    count(distinct w.stage_id)::integer,
    round(coalesce(sum(rs.distance_km), 0)::numeric, 1),
    round(coalesce(sum(w.condition_loss), 0)::numeric, 3)
  from public.race_engine_stage_wear_applications w
  join public.races r
    on r.id = w.race_id
  left join public.race_stages rs
    on rs.id = w.stage_id
  where w.club_id = v_club_id
    and w.target_table = 'club_team_cars'
    and w.target_id = p_team_car_id
  group by w.race_id, r.name, r.category, r.race_type, r.country_code
  order by max(w.applied_game_date) desc nulls last, r.name
  limit v_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_race_team_jersey_shortage_penalty_notification_v1(p_user_id uuid, p_race_id uuid, p_stage_id uuid, p_team_id uuid, p_required integer, p_available integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race text;
  v_team text;
  v_stage integer;
  v_missing integer;
  v_ratio numeric;
  v_prep numeric;
  v_energy numeric;
  v_fatigue numeric;
  v_id bigint;
begin
  if p_user_id is null then return null; end if;
  select name into v_race from public.races where id=p_race_id;
  select name into v_team from public.clubs where id=p_team_id;
  select stage_number into v_stage from public.race_stages where id=p_stage_id;

  v_missing := greatest(coalesce(p_required,0)-coalesce(p_available,0),0);
  v_ratio := case when coalesce(p_required,0)>0 then least(1::numeric,v_missing::numeric/p_required::numeric) else 0 end;
  v_prep := round(30*v_ratio,2);
  v_energy := round(8*v_ratio,2);
  v_fatigue := round(15*v_ratio,2);

  select public.ppm_create_user_notification_direct_v1(
    p_user_id,
    'RACE_JERSEYS_MANDATORY_WARNING',
    'Race Jersey shortage — performance penalty active',
    format('%s can still race in %s — Stage %s. %s of %s riders do not have an eligible Race Jersey Kit. The current shortage applies a -%s%% reduction to positive preparation bonuses, +%s%% in-stage energy cost and +%s%% post-stage fatigue. Add Race Jersey Kits to reduce or remove the penalty.',
      coalesce(v_team,'Your team'),coalesce(v_race,'the race'),coalesce(v_stage,0),v_missing,coalesce(p_required,0),v_prep,v_energy,v_fatigue),
    '/dashboard/equipment?tab=race-supplies',
    jsonb_build_object(
      'mandatory',false,
      'performance_penalty',true,
      'advisor_notification',false,
      'event_type','race_jersey_shortage_penalty',
      'reason_code','race_jersey_shortage_performance_penalty',
      'race_id',p_race_id,'race_name',v_race,
      'stage_id',p_stage_id,'stage_number',v_stage,
      'team_id',p_team_id,'team_name',v_team,
      'required_jersey_units',coalesce(p_required,0),
      'available_jersey_units',coalesce(p_available,0),
      'missing_jersey_units',v_missing,
      'shortage_ratio',round(v_ratio,6),
      'preparation_bonus_reduction_pct',v_prep,
      'energy_cost_penalty_pct',v_energy,
      'post_stage_fatigue_penalty_pct',v_fatigue,
      'team_remains_in_race',true,
      'race_supplies_path','/dashboard/equipment?tab=race-supplies',
      'race_path','/dashboard/races/'||p_race_id::text,
      'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/mandatory%20race%20jersey.png'
    ),
    'race_jersey_shortage_penalty:'||p_race_id::text||':'||p_stage_id::text||':'||p_team_id::text
  ) into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_reserve_scenario_v1(p_stage_id uuid, p_simulation_run_id uuid, p_audit jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage public.race_stages%rowtype;
  v_existing public.race_engine_scenario_runs%rowtype;
  v_run public.race_stage_simulation_runs%rowtype;
  v_existing_found boolean := false;
  v_template_id text := nullif(p_audit->>'templateId','');
  v_family text := nullif(p_audit->>'templateFamily','');
  v_similarity_group text := nullif(p_audit->>'similarityGroup','');
  v_catalog text := nullif(p_audit->>'catalogVersion','');
  v_seed text := nullif(p_audit->>'selectionSeed','');
  v_type text := nullif(p_audit->>'scenarioType','');
  v_version integer := greatest(1, coalesce((p_audit->>'templateVersion')::integer,1));
  v_score numeric := coalesce((p_audit->>'compatibilityScore')::numeric,0);
  v_allow_race_repeat boolean := coalesce((p_audit->>'repeatAllowedRace')::boolean,false);
  v_allow_day_repeat boolean := coalesce((p_audit->>'repeatAllowedDay')::boolean,false);
  v_compatible_count integer := 0;
  v_race_used_compatible integer := 0;
  v_day_used_compatible integer := 0;
  v_race_collision uuid;
  v_day_collision uuid;
begin
  if p_stage_id is null or p_simulation_run_id is null then
    raise exception using errcode='22023', message='stage_id and simulation_run_id are required';
  end if;
  if v_type not in ('flat','hilly','mountain','cobbled') then
    raise exception using errcode='22023', message='unsupported road scenario type';
  end if;
  if v_template_id is null or v_family is null or v_catalog is null or v_seed is null then
    raise exception using errcode='22023', message='road scenario audit is incomplete';
  end if;

  select * into v_stage from public.race_stages where id=p_stage_id;
  if not found then raise exception using errcode='P0002', message='stage not found'; end if;
  if lower(coalesce(v_stage.stage_format,'road_race')) <> 'road_race' then
    raise exception using errcode='22023', message='scenario reservation requires road_race stage format';
  end if;
  if lower(coalesce(v_stage.terrain_type,'')) <> v_type then
    raise exception using errcode='22023', message='scenario type does not match stage terrain type';
  end if;

  select * into v_run from public.race_stage_simulation_runs where id=p_simulation_run_id;
  if not found or v_run.stage_id<>p_stage_id or v_run.race_id<>v_stage.race_id then
    raise exception using errcode='22023', message='simulation run does not belong to stage';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('road_scenario:race:'||v_type||':'||v_stage.race_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('road_scenario:date:'||v_type||':'||v_stage.stage_date::text,0));

  select * into v_existing
  from public.race_engine_scenario_runs
  where stage_id=p_stage_id
  for update;
  v_existing_found := found;

  if v_existing_found and v_existing.selection_status='reserved' then
    update public.race_engine_scenario_runs
       set simulation_run_id=p_simulation_run_id,
           updated_at=clock_timestamp()
     where id=v_existing.id;
    return jsonb_build_object(
      'status','existing','stage_id',p_stage_id,'scenario_type',v_existing.scenario_type,
      'template_id',v_existing.template_id,'template_family',v_existing.template_family,
      'catalog_version',v_existing.catalog_version
    );
  end if;

  -- A scenario can be finalized before the stage itself is successfully published.
  -- On a later calculation retry, a completed scenario without an authoritative
  -- stage result must be reactivated. Otherwise Pass 1 returns "existing" while
  -- Pass 2 only accepts "reserved", leaving the run orphaned forever.
  if v_existing_found and v_existing.selection_status='completed' then
    if exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id) then
      return jsonb_build_object(
        'status','existing','stage_id',p_stage_id,'scenario_type',v_existing.scenario_type,
        'template_id',v_existing.template_id,'template_family',v_existing.template_family,
        'catalog_version',v_existing.catalog_version,'authoritative_stage',true
      );
    end if;

    update public.race_engine_scenario_runs
       set simulation_run_id=p_simulation_run_id,
           race_id=v_stage.race_id,
           game_date=v_stage.stage_date,
           scenario_type=v_type,
           template_id=v_template_id,
           template_version=v_version,
           template_family=v_family,
           similarity_group=coalesce(v_similarity_group,''),
           catalog_version=v_catalog,
           selection_seed=v_seed,
           compatibility_score=v_score,
           context_snapshot_json=coalesce(p_audit->'contextSnapshot','{}'::jsonb),
           candidate_scores_json=coalesce(p_audit->'candidateScores','[]'::jsonb),
           repetition_penalties_json=coalesce(p_audit->'repetitionPenalties','{}'::jsonb),
           generated_parameters_json=coalesce(p_audit->'generatedParameters','{}'::jsonb),
           applied_directives_json=coalesce(p_audit->'appliedDirectives','{}'::jsonb),
           selection_status='reserved',
           actual_outcome_json=null,
           completed_at=null,
           selected_at=clock_timestamp(),
           scenario_deviations_json=coalesce(v_existing.scenario_deviations_json,'[]'::jsonb)
             || jsonb_build_array(jsonb_build_object(
                  'kind','scenario_retry_reactivated_from_unpublished_completed',
                  'at',clock_timestamp(),
                  'simulation_run_id',p_simulation_run_id
                )),
           updated_at=clock_timestamp()
     where id=v_existing.id;

    return jsonb_build_object(
      'status','reserved','reactivated',true,'reactivated_from','completed_unpublished',
      'stage_id',p_stage_id,'scenario_type',v_type,'template_id',v_template_id,
      'template_family',v_family,'catalog_version',v_catalog
    );
  end if;

  select count(*) into v_compatible_count
  from jsonb_array_elements(coalesce(p_audit->'candidateScores','[]'::jsonb)) candidate
  where coalesce((candidate->>'rawScore')::numeric,-1) >= 42;

  if v_compatible_count > 0 then
    select count(distinct scenario.template_id) into v_race_used_compatible
    from public.race_engine_scenario_runs scenario
    where scenario.race_id=v_stage.race_id and scenario.stage_id<>p_stage_id and scenario.scenario_type=v_type
      and scenario.selection_status in ('reserved','completed')
      and scenario.template_id in (
        select candidate->>'templateId'
        from jsonb_array_elements(coalesce(p_audit->'candidateScores','[]'::jsonb)) candidate
        where coalesce((candidate->>'rawScore')::numeric,-1) >= 42
      );

    select count(distinct scenario.template_id) into v_day_used_compatible
    from public.race_engine_scenario_runs scenario
    where scenario.game_date=v_stage.stage_date and scenario.stage_id<>p_stage_id and scenario.scenario_type=v_type
      and scenario.selection_status in ('reserved','completed')
      and scenario.template_id in (
        select candidate->>'templateId'
        from jsonb_array_elements(coalesce(p_audit->'candidateScores','[]'::jsonb)) candidate
        where coalesce((candidate->>'rawScore')::numeric,-1) >= 42
      );

    if v_race_used_compatible >= v_compatible_count then v_allow_race_repeat := true; end if;
    if v_day_used_compatible >= v_compatible_count then v_allow_day_repeat := true; end if;
  end if;

  if not v_allow_race_repeat then
    select scenario.stage_id into v_race_collision
    from public.race_engine_scenario_runs scenario
    where scenario.race_id=v_stage.race_id and scenario.stage_id<>p_stage_id and scenario.scenario_type=v_type
      and scenario.template_id=v_template_id and scenario.selection_status in ('reserved','completed')
    order by scenario.selected_at limit 1;
    if v_race_collision is not null then
      return jsonb_build_object('status','collision','scope','race','scenario_type',v_type,'template_id',v_template_id,'conflicting_stage_id',v_race_collision);
    end if;
  end if;

  if not v_allow_day_repeat then
    select scenario.stage_id into v_day_collision
    from public.race_engine_scenario_runs scenario
    where scenario.game_date=v_stage.stage_date and scenario.stage_id<>p_stage_id and scenario.scenario_type=v_type
      and scenario.template_id=v_template_id and scenario.selection_status in ('reserved','completed')
    order by scenario.selected_at limit 1;
    if v_day_collision is not null then
      return jsonb_build_object('status','collision','scope','day','scenario_type',v_type,'template_id',v_template_id,'conflicting_stage_id',v_day_collision);
    end if;
  end if;

  if v_existing_found and v_existing.selection_status='failed' then
    update public.race_engine_scenario_runs
       set simulation_run_id=p_simulation_run_id,
           race_id=v_stage.race_id,
           game_date=v_stage.stage_date,
           scenario_type=v_type,
           template_id=v_template_id,
           template_version=v_version,
           template_family=v_family,
           similarity_group=coalesce(v_similarity_group,''),
           catalog_version=v_catalog,
           selection_seed=v_seed,
           compatibility_score=v_score,
           context_snapshot_json=coalesce(p_audit->'contextSnapshot','{}'::jsonb),
           candidate_scores_json=coalesce(p_audit->'candidateScores','[]'::jsonb),
           repetition_penalties_json=coalesce(p_audit->'repetitionPenalties','{}'::jsonb),
           generated_parameters_json=coalesce(p_audit->'generatedParameters','{}'::jsonb),
           applied_directives_json=coalesce(p_audit->'appliedDirectives','{}'::jsonb),
           selection_status='reserved',
           actual_outcome_json=null,
           completed_at=null,
           selected_at=clock_timestamp(),
           scenario_deviations_json=coalesce(v_existing.scenario_deviations_json,'[]'::jsonb)
             || jsonb_build_array(jsonb_build_object('kind','scenario_retry_reactivated','at',clock_timestamp())),
           updated_at=clock_timestamp()
     where id=v_existing.id;
    return jsonb_build_object(
      'status','reserved','reactivated',true,'stage_id',p_stage_id,'scenario_type',v_type,
      'template_id',v_template_id,'template_family',v_family,'catalog_version',v_catalog
    );
  end if;

  insert into public.race_engine_scenario_runs(
    simulation_run_id,race_id,stage_id,game_date,scenario_type,template_id,template_version,
    template_family,similarity_group,catalog_version,selection_seed,compatibility_score,
    context_snapshot_json,candidate_scores_json,repetition_penalties_json,
    generated_parameters_json,applied_directives_json,selection_status
  ) values (
    p_simulation_run_id,v_stage.race_id,p_stage_id,v_stage.stage_date,v_type,v_template_id,v_version,
    v_family,coalesce(v_similarity_group,''),v_catalog,v_seed,v_score,
    coalesce(p_audit->'contextSnapshot','{}'::jsonb),coalesce(p_audit->'candidateScores','[]'::jsonb),
    coalesce(p_audit->'repetitionPenalties','{}'::jsonb),coalesce(p_audit->'generatedParameters','{}'::jsonb),
    coalesce(p_audit->'appliedDirectives','{}'::jsonb),'reserved'
  );

  return jsonb_build_object(
    'status','reserved','reactivated',false,'stage_id',p_stage_id,'scenario_type',v_type,
    'template_id',v_template_id,'template_family',v_family,'catalog_version',v_catalog
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_finalize_scenario_v1(p_stage_id uuid, p_simulation_run_id uuid, p_actual_outcome jsonb DEFAULT '{}'::jsonb, p_deviations jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_updated public.race_engine_scenario_runs%rowtype;
  v_audit jsonb;
  v_computed_deviations jsonb := '[]'::jsonb;
  v_effective_deviations jsonb := '[]'::jsonb;
  v_effective_outcome jsonb := coalesce(p_actual_outcome, '{}'::jsonb);
begin
  v_audit := public.universal_race_stage_scenario_audit_v1(
    p_stage_id,
    p_simulation_run_id,
    coalesce(p_actual_outcome, '{}'::jsonb)
  );

  if jsonb_typeof(v_audit -> 'deviations') = 'array' then
    v_computed_deviations := v_audit -> 'deviations';
  end if;

  -- Preserve explicitly supplied deviations from a future runner version.
  -- Today the runner passes [], so the database-derived audit is used.
  if p_deviations is null or p_deviations = '[]'::jsonb then
    v_effective_deviations := v_computed_deviations;
  else
    v_effective_deviations := p_deviations;
  end if;

  v_effective_outcome := v_effective_outcome || jsonb_build_object(
    'scenario_audit_v1', coalesce(v_audit -> 'metrics', '{}'::jsonb)
  );

  update public.race_engine_scenario_runs
  set simulation_run_id = p_simulation_run_id,
      selection_status = 'completed',
      actual_outcome_json = v_effective_outcome,
      scenario_deviations_json = v_effective_deviations,
      completed_at = coalesce(completed_at, clock_timestamp()),
      updated_at = clock_timestamp()
  where stage_id = p_stage_id
  returning * into v_updated;

  if not found then
    return jsonb_build_object('status', 'not_found', 'stage_id', p_stage_id);
  end if;

  return jsonb_build_object(
    'status', 'completed',
    'stage_id', p_stage_id,
    'template_id', v_updated.template_id,
    'deviation_count', jsonb_array_length(v_effective_deviations),
    'audit_version', 'scenario_deviation_audit_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_abandon_scenario_v1(p_stage_id uuid, p_simulation_run_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_updated public.race_engine_scenario_runs%rowtype;
begin
  update public.race_engine_scenario_runs
  set simulation_run_id = p_simulation_run_id,
      selection_status = 'failed',
      scenario_deviations_json = coalesce(scenario_deviations_json,'[]'::jsonb) ||
        jsonb_build_array(jsonb_build_object(
          'kind','scenario_abandoned',
          'reason',coalesce(nullif(p_reason,''),'primary_not_official'),
          'at',clock_timestamp()
        )),
      updated_at = clock_timestamp()
  where stage_id = p_stage_id
    and selection_status = 'reserved'
  returning * into v_updated;

  if not found then
    return jsonb_build_object('status','not_found_or_not_reserved','stage_id',p_stage_id);
  end if;

  return jsonb_build_object(
    'status','failed',
    'stage_id',p_stage_id,
    'scenario_type',v_updated.scenario_type,
    'template_id',v_updated.template_id,
    'reason',coalesce(nullif(p_reason,''),'primary_not_official')
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_scenario_audit_v1(p_stage_id uuid, p_simulation_run_id uuid, p_actual_outcome jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scenario public.race_engine_scenario_runs%rowtype;
  v_result jsonb;
  v_rr jsonb;
  v_generated jsonb;
  v_break jsonb;
  v_distance_km numeric;
  v_planned_formation_pct numeric;
  v_planned_formation_km numeric;
  v_planned_size numeric;
  v_planned_peak_gap_sec numeric;
  v_planned_chase_start_pct numeric;
  v_planned_chase_start_km numeric;
  v_planned_catch_km_remaining numeric;
  v_planned_catch_km numeric;
  v_planned_survival_sec numeric;
  v_target_front_group numeric;
  v_fragmentation_pressure numeric;
  v_p1_break_size integer := 0;
  v_max_break_size integer := 0;
  v_peak_gap_sec numeric := 0;
  v_first_positive_gap_km numeric;
  v_catch_km numeric;
  v_breakaway_caught boolean := false;
  v_breakaway_survived boolean := false;
  v_same_time_count integer := 0;
  v_classification_count integer := 0;
  v_same_time_share numeric := 0;
  v_fragmented_share numeric := 0;
  v_deviations jsonb := '[]'::jsonb;
  v_metrics jsonb;
  v_tolerance_km numeric;
  v_break_low_threshold numeric;
  v_break_high_threshold numeric;
  v_front_low_threshold numeric;
  v_front_high_threshold numeric;
  v_expected_catch boolean := false;
begin
  select * into v_scenario from public.race_engine_scenario_runs where stage_id = p_stage_id;
  if not found then
    return jsonb_build_object('status','scenario_not_found','deviations','[]'::jsonb,'metrics',jsonb_build_object('audit_version','scenario_deviation_audit_v2'));
  end if;
  select sr.result_summary_json #> '{output_snapshot,universalResult}' into v_result
  from public.race_stage_simulation_runs sr
  where sr.id = p_simulation_run_id and sr.stage_id = p_stage_id limit 1;
  v_generated := coalesce(v_scenario.generated_parameters_json, '{}'::jsonb);
  v_break := coalesce(v_generated -> 'breakaways' -> 0, '{}'::jsonb);
  v_rr := coalesce(v_result -> 'roadRaceResolution', '{}'::jsonb);
  v_distance_km := nullif(v_scenario.context_snapshot_json #>> '{profile,distanceKm}', '')::numeric;
  v_planned_formation_pct := nullif(v_break ->> 'formationPct', '')::numeric;
  v_planned_size := nullif(v_break ->> 'preferredSize', '')::numeric;
  v_planned_peak_gap_sec := nullif(v_break ->> 'targetPeakGapSec', '')::numeric;
  v_planned_chase_start_pct := nullif(v_break ->> 'chaseStartPct', '')::numeric;
  v_planned_catch_km_remaining := nullif(v_break ->> 'catchKmRemaining', '')::numeric;
  v_planned_survival_sec := nullif(v_break ->> 'survivalTargetSec', '')::numeric;
  v_target_front_group := nullif(v_generated ->> 'targetFrontGroup', '')::numeric;
  v_fragmentation_pressure := nullif(v_generated ->> 'fragmentationPressure', '')::numeric;
  if v_distance_km is not null then
    if v_planned_formation_pct is not null then v_planned_formation_km := v_distance_km * v_planned_formation_pct; end if;
    if v_planned_chase_start_pct is not null then v_planned_chase_start_km := v_distance_km * v_planned_chase_start_pct; end if;
    if v_planned_catch_km_remaining is not null then v_planned_catch_km := greatest(0, v_distance_km - v_planned_catch_km_remaining); end if;
    v_tolerance_km := greatest(10, v_distance_km * 0.10);
  else
    v_tolerance_km := 12;
  end if;
  v_p1_break_size := case when jsonb_typeof(v_rr #> '{phase1Opening,breakawayRiderIds}')='array' then jsonb_array_length(v_rr #> '{phase1Opening,breakawayRiderIds}') else 0 end;
  v_max_break_size := greatest(
    v_p1_break_size,
    case when jsonb_typeof(v_rr #> '{phase2Development,breakawayRiderIdsAtStart}')='array' then jsonb_array_length(v_rr #> '{phase2Development,breakawayRiderIdsAtStart}') else 0 end,
    case when jsonb_typeof(v_rr #> '{phase2Development,breakawayRiderIdsAtEnd}')='array' then jsonb_array_length(v_rr #> '{phase2Development,breakawayRiderIdsAtEnd}') else 0 end,
    case when jsonb_typeof(v_rr #> '{phase3Decisive,physicalEscapeRiderIdsAtStart}')='array' then jsonb_array_length(v_rr #> '{phase3Decisive,physicalEscapeRiderIdsAtStart}') else 0 end,
    case when jsonb_typeof(v_rr #> '{phase3Decisive,physicalEscapeRiderIdsAtEnd}')='array' then jsonb_array_length(v_rr #> '{phase3Decisive,physicalEscapeRiderIdsAtEnd}') else 0 end,
    case when jsonb_typeof(v_rr #> '{phase4Finish,escapeRiderIdsAtStart}')='array' then jsonb_array_length(v_rr #> '{phase4Finish,escapeRiderIdsAtStart}') else 0 end,
    case when jsonb_typeof(v_rr #> '{phase4Finish,frontRiderIdsAfterBridges}')='array' then jsonb_array_length(v_rr #> '{phase4Finish,frontRiderIdsAfterBridges}') else 0 end
  );
  select coalesce(max(q.gap_seconds),0), min(q.km_from_start) filter (where q.gap_seconds>0)
  into v_peak_gap_sec, v_first_positive_gap_km
  from (
    select nullif(e->>'gapSeconds','')::numeric as gap_seconds, nullif(e->>'kmFromStart','')::numeric as km_from_start
    from jsonb_array_elements(case when jsonb_typeof(v_rr #> '{phase1Opening,physicalGapTrajectory}')='array' then v_rr #> '{phase1Opening,physicalGapTrajectory}' else '[]'::jsonb end) e
    union all
    select nullif(e->>'gapSeconds','')::numeric, nullif(e->>'kmFromStart','')::numeric
    from jsonb_array_elements(case when jsonb_typeof(v_rr #> '{phase2Development,physicalGapTrajectory}')='array' then v_rr #> '{phase2Development,physicalGapTrajectory}' else '[]'::jsonb end) e
    union all
    select nullif(e->>'gapSeconds','')::numeric, nullif(e->>'kmFromStart','')::numeric
    from jsonb_array_elements(case when jsonb_typeof(v_rr #> '{phase3Decisive,physicalGapTrajectory}')='array' then v_rr #> '{phase3Decisive,physicalGapTrajectory}' else '[]'::jsonb end) e
  ) q;
  v_peak_gap_sec := greatest(coalesce(v_peak_gap_sec,0),coalesce(nullif(v_rr #>> '{phase4Finish,startGapSeconds}','')::numeric,0),coalesce(nullif(v_rr #>> '{phase4Finish,endGapSeconds}','')::numeric,0));
  v_catch_km := coalesce(nullif(v_rr #>> '{phase2Development,breakawayCatchKm}','')::numeric,nullif(v_rr #>> '{phase3Decisive,physicalCatchKm}','')::numeric);
  v_breakaway_caught := coalesce(nullif(v_rr #>> '{phase4Finish,breakawayCaught}','')::boolean,false);
  v_breakaway_survived := coalesce(nullif(v_rr #>> '{phase4Finish,breakawaySurvived}','')::boolean,false);
  v_same_time_count := coalesce(nullif(p_actual_outcome->>'same_time_rider_count','')::integer,0);
  v_classification_count := coalesce(nullif(p_actual_outcome->>'classification_rider_count','')::integer,0);
  if v_classification_count>0 then
    v_same_time_share := least(1,greatest(0,v_same_time_count::numeric/v_classification_count::numeric));
    v_fragmented_share := 1-v_same_time_share;
  end if;
  if v_planned_size is not null then
    v_break_low_threshold := greatest(1,floor(v_planned_size*0.60));
    v_break_high_threshold := greatest(v_planned_size+2,ceil(v_planned_size*1.50));
  end if;
  if v_target_front_group is not null then
    v_front_low_threshold := greatest(1,floor(v_target_front_group*0.50));
    v_front_high_threshold := greatest(v_target_front_group+8,ceil(v_target_front_group*1.75));
  end if;
  v_expected_catch := v_planned_catch_km is not null or (v_planned_chase_start_km is not null and coalesce(v_planned_survival_sec,0)<=0);
  if v_planned_size is not null and v_planned_size>=2 and (v_first_positive_gap_km is null or (v_planned_formation_km is not null and v_first_positive_gap_km>v_planned_formation_km+v_tolerance_km)) then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','early_break_failed','severity','major','expected',jsonb_build_object('preferred_size',v_planned_size,'formation_km',case when v_planned_formation_km is null then null else round(v_planned_formation_km,1) end),'actual',jsonb_build_object('max_break_size',v_max_break_size,'first_positive_gap_km',case when v_first_positive_gap_km is null then null else round(v_first_positive_gap_km,1) end),'explanation',case when v_first_positive_gap_km is null then 'The scenario called for an early break, but no positive physical breakaway gap was established.' else 'A physical breakaway formed materially later than the scenario formation target.' end));
  end if;
  if v_planned_size is not null and v_planned_size>=2 and v_max_break_size<v_break_low_threshold then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','break_size_below_target','severity','major','expected',jsonb_build_object('preferred_size',v_planned_size,'material_floor',v_break_low_threshold),'actual',jsonb_build_object('max_break_size',v_max_break_size),'explanation','The largest observed breakaway was materially smaller than the generated scenario target.'));
  elsif v_planned_size is not null and v_planned_size>=2 and v_max_break_size>v_break_high_threshold then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','break_size_above_target','severity','moderate','expected',jsonb_build_object('preferred_size',v_planned_size,'material_ceiling',v_break_high_threshold),'actual',jsonb_build_object('max_break_size',v_max_break_size),'explanation','The largest observed breakaway was materially larger than the generated scenario target.'));
  end if;
  if v_planned_peak_gap_sec is not null and v_planned_peak_gap_sec>0 and v_peak_gap_sec<v_planned_peak_gap_sec*0.60 then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','peak_gap_undershot','severity','major','expected',jsonb_build_object('target_peak_gap_sec',round(v_planned_peak_gap_sec,1)),'actual',jsonb_build_object('peak_physical_gap_sec',round(v_peak_gap_sec,1)),'explanation','The breakaway never built the material advantage targeted by the scenario.'));
  elsif v_planned_peak_gap_sec is not null and v_planned_peak_gap_sec>0 and v_peak_gap_sec>v_planned_peak_gap_sec*1.60 then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','peak_gap_overshot','severity','moderate','expected',jsonb_build_object('target_peak_gap_sec',round(v_planned_peak_gap_sec,1)),'actual',jsonb_build_object('peak_physical_gap_sec',round(v_peak_gap_sec,1)),'explanation','The breakaway gained a materially larger maximum advantage than the scenario target.'));
  end if;
  if v_catch_km is not null and ((v_planned_chase_start_km is not null and v_catch_km<v_planned_chase_start_km-greatest(5,v_tolerance_km*0.50)) or (v_planned_catch_km is not null and v_catch_km<v_planned_catch_km-v_tolerance_km)) then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','break_caught_early','severity','major','expected',jsonb_build_object('planned_chase_start_km',case when v_planned_chase_start_km is null then null else round(v_planned_chase_start_km,1) end,'planned_catch_km',case when v_planned_catch_km is null then null else round(v_planned_catch_km,1) end),'actual',jsonb_build_object('physical_catch_km',round(v_catch_km,1)),'explanation','The breakaway was physically caught materially earlier than the planned chase/catch story.'));
  end if;
  if v_breakaway_survived and v_expected_catch then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','break_survived_unexpectedly','severity','major','expected',jsonb_build_object('planned_catch_km',case when v_planned_catch_km is null then null else round(v_planned_catch_km,1) end,'survival_target_sec',v_planned_survival_sec),'actual',jsonb_build_object('breakaway_survived',true,'breakaway_caught',v_breakaway_caught),'explanation','The scenario expected the break to be caught, but the physical breakaway survived the finish phase.'));
  end if;
  if v_target_front_group is not null and v_target_front_group>0 and v_same_time_count>v_front_high_threshold then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','front_group_larger_than_target','severity','major','expected',jsonb_build_object('target_front_group',v_target_front_group,'material_ceiling',v_front_high_threshold),'actual',jsonb_build_object('same_time_rider_count',v_same_time_count,'classification_rider_count',v_classification_count),'explanation','The official front same-time group was materially larger than the scenario target.'));
  elsif v_target_front_group is not null and v_target_front_group>=6 and v_same_time_count<v_front_low_threshold then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','front_group_smaller_than_target','severity','moderate','expected',jsonb_build_object('target_front_group',v_target_front_group,'material_floor',v_front_low_threshold),'actual',jsonb_build_object('same_time_rider_count',v_same_time_count,'classification_rider_count',v_classification_count),'explanation','The official front same-time group was materially smaller than the scenario target.'));
  end if;
  if v_fragmentation_pressure is not null and v_classification_count>0 and v_fragmentation_pressure>=0.50 and v_fragmented_share>0 and v_fragmented_share<greatest(0.08,v_fragmentation_pressure*0.30) then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','fragmentation_below_target','severity','moderate','expected',jsonb_build_object('fragmentation_pressure',round(v_fragmentation_pressure,4)),'actual',jsonb_build_object('fragmented_share',round(v_fragmented_share,4),'same_time_share',round(v_same_time_share,4)),'explanation','The field remained materially more compact than the scenario fragmentation pressure called for.'));
  elsif v_fragmentation_pressure is not null and v_classification_count>0 and v_fragmentation_pressure<=0.50 and v_fragmented_share>least(0.80,v_fragmentation_pressure+0.35) then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','fragmentation_above_target','severity','moderate','expected',jsonb_build_object('fragmentation_pressure',round(v_fragmentation_pressure,4)),'actual',jsonb_build_object('fragmented_share',round(v_fragmented_share,4),'same_time_share',round(v_same_time_share,4)),'explanation','The field split materially more than the scenario fragmentation pressure called for.'));
  end if;
  if v_classification_count>0 and v_target_front_group is not null and v_target_front_group<=30 and v_same_time_count>=greatest(40,ceil(v_classification_count*0.60)) and not v_breakaway_survived then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','finale_converted_to_large_group_sprint','severity','major','expected',jsonb_build_object('target_front_group',v_target_front_group,'template_family',v_scenario.template_family),'actual',jsonb_build_object('same_time_rider_count',v_same_time_count,'same_time_share',round(v_same_time_share,4),'breakaway_survived',false),'explanation','A scenario targeting a selective finale resolved as a large same-time group finish.'));
  end if;
  if v_breakaway_survived and lower(coalesce(v_scenario.template_family,''))<>'breakaway' and coalesce(v_planned_survival_sec,0)<=0 then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','finale_converted_to_breakaway','severity','major','expected',jsonb_build_object('template_family',v_scenario.template_family,'survival_target_sec',v_planned_survival_sec),'actual',jsonb_build_object('breakaway_survived',true,'same_time_rider_count',v_same_time_count),'explanation','A scenario not targeting a surviving breakaway ended with the physical break still alive in the finish phase.'));
  end if;
  v_metrics := jsonb_build_object('audit_version','scenario_deviation_audit_v2','template_id',v_scenario.template_id,'scenario_type',v_scenario.scenario_type,'template_family',v_scenario.template_family,'planned',jsonb_build_object('formation_km',case when v_planned_formation_km is null then null else round(v_planned_formation_km,1) end,'preferred_break_size',v_planned_size,'target_peak_gap_sec',v_planned_peak_gap_sec,'planned_chase_start_km',case when v_planned_chase_start_km is null then null else round(v_planned_chase_start_km,1) end,'planned_catch_km',case when v_planned_catch_km is null then null else round(v_planned_catch_km,1) end,'survival_target_sec',v_planned_survival_sec,'target_front_group',v_target_front_group,'fragmentation_pressure',v_fragmentation_pressure),'actual',jsonb_build_object('phase1_break_size',v_p1_break_size,'max_break_size',v_max_break_size,'first_positive_gap_km',case when v_first_positive_gap_km is null then null else round(v_first_positive_gap_km,1) end,'peak_physical_gap_sec',round(v_peak_gap_sec,1),'physical_catch_km',case when v_catch_km is null then null else round(v_catch_km,1) end,'breakaway_caught',v_breakaway_caught,'breakaway_survived',v_breakaway_survived,'same_time_rider_count',v_same_time_count,'classification_rider_count',v_classification_count,'same_time_share',round(v_same_time_share,4),'fragmented_share',round(v_fragmented_share,4)),'deviation_count',jsonb_array_length(v_deviations));
  return jsonb_build_object('status','completed','deviations',v_deviations,'metrics',v_metrics);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_calculation_v2_impl(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage record;
  v_previous_stage_id uuid;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_existing_run public.race_stage_simulation_runs%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_calculation_due_game_at timestamp without time zone;
  v_run_id uuid;
  v_startlist_readiness jsonb;
  v_startlist_reconciliation jsonb;
  v_sporting_readiness jsonb;
  v_sporting_reconciliation jsonb;
begin
  if p_stage_id is null then return jsonb_build_object('status','blocked','reason','stage_id_required'); end if;
  perform pg_advisory_xact_lock(hashtextextended('phase11b_claim:'||p_stage_id::text,0));

  select * into v_control from public.race_engine_runtime_control_v1 where singleton_id=true;
  if not found or v_control.active_engine<>'typescript_v1' or not v_control.typescript_execution_enabled or v_control.legacy_execution_enabled
     or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled','reason','phase11b_lifecycle_not_enabled');
  end if;
  if v_control.typescript_activation_game_at is null then return jsonb_build_object('status','disabled','reason','production_activation_game_boundary_missing'); end if;

  select stage.id,stage.race_id,stage.stage_number,stage.stage_date,stage.planned_start_hour_number,stage.planned_start_minute,
    lower(coalesce(stage.stage_format,'road_race')) as stage_format,coalesce(stage.weather_cancelled,false) as weather_cancelled
  into v_stage from public.race_stages stage where stage.id=p_stage_id;
  if not found then return jsonb_build_object('status','blocked','reason','stage_not_found','stage_id',p_stage_id); end if;
  if v_stage.weather_cancelled then return jsonb_build_object('status','skipped','reason','weather_cancelled','stage_id',p_stage_id); end if;

  v_stage_start_game_at := public.race_stage_planned_start_game_at_v1(p_stage_id)::timestamp without time zone;
  v_calculation_due_game_at := v_stage_start_game_at - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3));
  select public.get_current_game_timestamp()::timestamp without time zone into v_current_game_at;
  if v_stage_start_game_at<v_control.typescript_activation_game_at then
    return jsonb_build_object('status','blocked','reason','before_phase11b_activation_boundary','stage_id',p_stage_id,'stage_start_game_at',v_stage_start_game_at,'activation_game_at',v_control.typescript_activation_game_at);
  end if;
  if v_current_game_at<v_calculation_due_game_at then
    return jsonb_build_object('status','not_due','stage_id',p_stage_id,'current_game_at',v_current_game_at,'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at);
  end if;

  v_sporting_readiness := public.race_stage_sporting_point_profile_readiness_v1(p_stage_id);
  if not coalesce((v_sporting_readiness->>'ready')::boolean,false) then
    v_sporting_reconciliation := public.reconcile_unprocessed_stage_sporting_points_v1(p_stage_id);
    v_sporting_readiness := public.race_stage_sporting_point_profile_readiness_v1(p_stage_id);
    if not coalesce((v_sporting_readiness->>'ready')::boolean,false) then
      return jsonb_build_object('status','blocked','reason','stage_sporting_points_not_engine_ready','stage_id',p_stage_id,'race_id',v_stage.race_id,
        'sporting_point_readiness',v_sporting_readiness,'sporting_point_reconciliation',v_sporting_reconciliation);
    end if;
  else
    v_sporting_reconciliation := jsonb_build_object('status','not_needed','stage_id',p_stage_id);
  end if;

  v_startlist_readiness := public.race_startlist_engine_readiness_v1(v_stage.race_id);
  if not coalesce((v_startlist_readiness->>'ready')::boolean,false) then
    return jsonb_build_object('status','blocked','reason','race_startlist_not_engine_ready','stage_id',p_stage_id,'race_id',v_stage.race_id,'startlist_readiness',v_startlist_readiness);
  end if;
  v_startlist_reconciliation := public.reconcile_race_startlist_engine_readiness_v1(v_stage.race_id);

  select previous.id into v_previous_stage_id from public.race_stages previous
  where previous.race_id=v_stage.race_id and previous.stage_number<v_stage.stage_number and not coalesce(previous.weather_cancelled,false)
  order by previous.stage_number desc limit 1;
  if v_previous_stage_id is not null and not exists(
    select 1 from public.race_stage_authoritative_runs authority
    join public.race_stage_simulation_runs previous_run on previous_run.id=authority.simulation_run_id
    where authority.stage_id=v_previous_stage_id and authority.engine_version='race_engine_ts_v1'
      and authority.simulation_mode='deterministic_road_race_v1' and previous_run.status='completed'
  ) then
    return jsonb_build_object('status','blocked','reason','previous_stage_not_published','stage_id',p_stage_id,'previous_stage_id',v_previous_stage_id);
  end if;

  select run.* into v_existing_run from public.race_stage_simulation_runs run
  where run.stage_id=p_stage_id and run.engine_version='race_engine_ts_v1' and run.simulation_mode='deterministic_road_race_v1'
    and run.status in ('running','completed') and coalesce(run.result_summary_json->>'calculation_contract','') in ('phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1')
  order by run.updated_at desc,run.created_at desc,run.id desc limit 1;
  if found then
    return jsonb_build_object('status',case when coalesce(v_existing_run.result_summary_json->>'calculation_contract','')='universal_phase11b_calculated_hidden_v1' then 'already_calculated' else 'already_claimed' end,
      'stage_id',p_stage_id,'simulation_run_id',v_existing_run.id,'run_status',v_existing_run.status);
  end if;

  perform set_config('app.race_engine_writer_family','typescript',true);
  insert into public.race_stage_simulation_runs(race_id,stage_id,status,engine_version,simulation_mode,started_at,input_snapshot_json,result_summary_json)
  values(v_stage.race_id,p_stage_id,'running','race_engine_ts_v1','deterministic_road_race_v1',clock_timestamp(),'{}'::jsonb,
    jsonb_build_object('calculation_contract','phase11b_claim_pending_v1','calculation_status','claimed','claimed_at_real',clock_timestamp(),
      'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,'official_outputs_persisted',false,
      'phase11_persistence_applied',false,'results_published',false,'verification_only',false,'startlist_readiness',v_startlist_readiness,
      'startlist_reconciliation',v_startlist_reconciliation,'sporting_point_readiness',v_sporting_readiness,'sporting_point_reconciliation',v_sporting_reconciliation))
  returning id into v_run_id;

  insert into public.race_stage_automation_state(stage_id,race_id,scheduled_game_at,last_status,simulation_run_id,attempt_count,last_checked_at,last_started_at,last_error,details,updated_at)
  values(p_stage_id,v_stage.race_id,v_stage_start_game_at,'calculating',v_run_id,1,clock_timestamp(),clock_timestamp(),null,
    jsonb_build_object('contract','phase11b_universal_production_lifecycle_v2_split_payload','calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,
      'replay_duration_real_seconds',coalesce(v_control.typescript_replay_duration_real_seconds,900),'worker_version','supabase_edge_phase11b_split_payload_v2','verification_only',false,
      'startlist_readiness_model','snapshot_invariants_v1','sporting_point_readiness_model','profile_catalogue_counts_v1'),clock_timestamp())
  on conflict(stage_id) do update set race_id=excluded.race_id,scheduled_game_at=excluded.scheduled_game_at,last_status=excluded.last_status,
    simulation_run_id=excluded.simulation_run_id,attempt_count=public.race_stage_automation_state.attempt_count+1,last_checked_at=excluded.last_checked_at,
    last_started_at=excluded.last_started_at,last_error=null,details=coalesce(public.race_stage_automation_state.details,'{}'::jsonb)||excluded.details,updated_at=excluded.updated_at;

  return jsonb_build_object('status','claimed','contract','universal_race_stage_calculation_claim_v3_split_payload','stage_id',p_stage_id,'race_id',v_stage.race_id,
    'simulation_run_id',v_run_id,'current_game_at',v_current_game_at,'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,
    'stage_format',v_stage.stage_format,'startlist_readiness',v_startlist_readiness,'sporting_point_readiness',v_sporting_readiness,
    'sporting_point_reconciliation',v_sporting_reconciliation,'payload_deferred',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_next_due_v2_impl(p_worker_id text DEFAULT 'supabase_edge_phase11b_split_payload_v2'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '25s'
AS $function$
declare
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage record;
  v_claim jsonb;
  v_blocked jsonb := '[]'::jsonb;
begin
  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id=true;

  if not found or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled');
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone
    into v_current_game_at;

  /*
   * FAST CLAIM PATH:
   * The due-stage watchdog already performs schedule calculation, readiness
   * checks and self-healing. Reuse that materialized queue instead of calling
   * race_stage_planned_start_game_at_v1 repeatedly across the full stage table.
   */
  for v_stage in
    select
      w.stage_id,
      w.race_id,
      r.name as race_name,
      s.stage_number,
      w.stage_start_game_at,
      w.calculation_due_game_at,
      w.readiness
    from public.race_engine_due_stage_watchdog_v1 w
    join public.race_stages s on s.id=w.stage_id
    join public.races r on r.id=w.race_id
    where w.ready=true
      and w.calculation_due_game_at <= v_current_game_at
      and w.last_checked_game_at >= v_current_game_at - interval '20 minutes'
      and not coalesce(s.weather_cancelled,false)
      and w.stage_start_game_at >= v_control.typescript_activation_game_at
      and not exists (
        select 1
        from public.race_stage_authoritative_runs authority
        where authority.stage_id=w.stage_id
      )
      and not exists (
        select 1
        from public.race_stage_simulation_runs run
        where run.stage_id=w.stage_id
          and run.engine_version='race_engine_ts_v1'
          and run.simulation_mode='deterministic_road_race_v1'
          and run.status in ('running','completed')
          and coalesce(run.result_summary_json->>'calculation_contract','')
              in ('phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1')
      )
    order by
      w.calculation_due_game_at,
      w.stage_start_game_at,
      w.race_id,
      s.stage_number
    limit 25
  loop
    begin
      v_claim := public.universal_race_stage_claim_calculation_v2(v_stage.stage_id);
    exception when others then
      v_blocked := v_blocked || jsonb_build_array(jsonb_build_object(
        'stage_id',v_stage.stage_id,
        'race_id',v_stage.race_id,
        'race_name',v_stage.race_name,
        'stage_number',v_stage.stage_number,
        'reason','claim_exception',
        'sqlstate',sqlstate,
        'message',sqlerrm
      ));
      continue;
    end;

    if coalesce(v_claim->>'status','')='claimed' then
      return v_claim || jsonb_build_object(
        'worker_id',coalesce(nullif(p_worker_id,''),'supabase_edge_phase11b_split_payload_v2'),
        'scheduler_skipped_blocks',v_blocked,
        'scheduler_fast_path','due_stage_watchdog_queue_v2',
        'watchdog_readiness',v_stage.readiness,
        'survival_mode',public.universal_race_stage_survival_mode_v1(v_stage.stage_id)
      );
    end if;

    v_blocked := v_blocked || jsonb_build_array(jsonb_build_object(
      'stage_id',v_stage.stage_id,
      'race_id',v_stage.race_id,
      'race_name',v_stage.race_name,
      'stage_number',v_stage.stage_number,
      'reason',coalesce(v_claim->>'reason',v_claim->>'status','claim_not_granted'),
      'claim_result',v_claim
    ));
  end loop;

  return jsonb_build_object(
    'status','no_due_stage',
    'current_game_at',v_current_game_at,
    'scheduler_skipped_blocks',v_blocked,
    'scheduler_fast_path','due_stage_watchdog_queue_v2'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_next_due_v2(p_worker_id text DEFAULT 'supabase_edge_phase11b_split_payload_v2'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '25s'
AS $function$
declare
  v_survival jsonb;
  v_result jsonb;
  v_active record;
  v_recovery_pending record;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('universal_race_single_active_calculation_v2', 0)
  );

  -- Run survival recovery once here. The implementation no longer repeats it.
  v_survival := public.universal_race_stage_survival_recover_v1();

  select sr.stage_id,
         sr.id as simulation_run_id,
         coalesce(nullif(sr.result_summary_json->>'survival_phase',''),'claimed') as survival_phase,
         coalesce(
           (sr.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
           sr.updated_at, sr.started_at, sr.created_at
         ) as heartbeat_at
    into v_active
  from public.race_stage_simulation_runs sr
  where sr.engine_version='race_engine_ts_v1'
    and sr.simulation_mode='deterministic_road_race_v1'
    and sr.status='running'
    and coalesce(sr.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
    and not exists (
      select 1 from public.race_stage_authoritative_runs a where a.stage_id=sr.stage_id
    )
  order by coalesce(
    (sr.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
    sr.updated_at, sr.started_at, sr.created_at
  ) desc
  limit 1;

  if found then
    return jsonb_build_object(
      'status','worker_busy',
      'reason','single_active_calculation_guard',
      'active_stage_id',v_active.stage_id,
      'active_simulation_run_id',v_active.simulation_run_id,
      'active_phase',v_active.survival_phase,
      'active_heartbeat_at_real',v_active.heartbeat_at,
      'worker_id',coalesce(nullif(p_worker_id,''),'supabase_edge_phase11b_split_payload_v2'),
      'worker_model','single_active_calculation_v2',
      'global_worker_lock',true,
      'survival',v_survival
    );
  end if;

  select sr.stage_id,
         sr.id as simulation_run_id,
         coalesce(sr.result_summary_json->>'survival_phase','') as survival_phase,
         sr.failed_at
    into v_recovery_pending
  from public.race_stage_simulation_runs sr
  where sr.engine_version='race_engine_ts_v1'
    and sr.simulation_mode='deterministic_road_race_v1'
    and sr.status='failed'
    and sr.failed_at > clock_timestamp() - interval '2 hours'
    and coalesce(sr.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
    and coalesce(sr.result_summary_json->>'survival_phase','')
        in ('pass1_resume_claimed','pass1_payload_loading','pass1_started')
    and sr.error_message='Race calculation survival watchdog recovered an expired calculation lease.'
    and not exists (
      select 1 from public.race_stage_authoritative_runs a where a.stage_id=sr.stage_id
    )
  order by sr.failed_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'status','worker_busy',
      'reason','pass1_emergency_fallback_pending',
      'active_stage_id',v_recovery_pending.stage_id,
      'active_simulation_run_id',v_recovery_pending.simulation_run_id,
      'active_phase',v_recovery_pending.survival_phase,
      'active_heartbeat_at_real',v_recovery_pending.failed_at,
      'worker_id',coalesce(nullif(p_worker_id,''),'supabase_edge_phase11b_split_payload_v2'),
      'worker_model','single_active_calculation_v2',
      'global_worker_lock',true,
      'survival',v_survival
    );
  end if;

  v_result := public.universal_race_stage_claim_next_due_v2_impl(p_worker_id);

  return coalesce(v_result, '{}'::jsonb)
    || jsonb_build_object(
      'worker_model','single_active_calculation_v2',
      'global_worker_lock',true,
      'survival',v_survival
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_get_calculation_payload_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_payload jsonb;
  v_phase9 jsonb;
begin
  v_payload := public.universal_race_stage_get_calculation_payload_v1(p_stage_id);
  v_phase9 := public.universal_race_stage_compact_phase9_for_engine_v1(v_payload->'phase9_inputs');

  return jsonb_set(
    v_payload || jsonb_build_object('contract','universal_race_calculation_payload_v4_compact_phase9'),
    '{phase9_inputs}',
    coalesce(v_phase9,'{}'::jsonb),
    true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_get_calculation_payload_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '45s'
 SET lock_timeout TO '5s'
AS $function$
declare
  v_payload jsonb;
  v_preparation jsonb;
  v_modifiers jsonb;
  v_simulation_run_id uuid;
begin
  select r.id
    into v_simulation_run_id
  from public.race_stage_simulation_runs r
  where r.stage_id = p_stage_id
    and r.status = 'running'
  order by r.started_at desc nulls last, r.created_at desc
  limit 1;

  if v_simulation_run_id is not null then
    begin
      perform public.universal_race_stage_survival_heartbeat_v1(
        p_stage_id,
        v_simulation_run_id,
        'payload_loading',
        jsonb_build_object('source', 'calculation_payload_rpc')
      );
    exception when others then
      null;
    end;
  end if;

  v_payload := public.universal_race_stage_get_calculation_payload_full_v1(p_stage_id);

  -- The race engine consumes the already-computed Phase 9 numeric modifiers.
  -- Do not send the large duplicated equipment catalog/snapshot blocks across
  -- the Edge/PostgREST boundary for every calculation.
  v_preparation := v_payload #> '{phase9_inputs,preparation}';
  if jsonb_typeof(v_preparation) = 'object' then
    v_payload := jsonb_set(
      v_payload,
      '{phase9_inputs,preparation}',
      v_preparation - 'equipment',
      false
    );
  end if;

  v_modifiers := v_payload #> '{phase9_inputs,riderModifiers}';
  if jsonb_typeof(v_modifiers) = 'array' then
    v_payload := jsonb_set(
      v_payload,
      '{phase9_inputs,riderModifiers}',
      coalesce(
        (
          select jsonb_agg(value - 'equipment_selection' order by ordinality)
          from jsonb_array_elements(v_modifiers) with ordinality as e(value, ordinality)
        ),
        '[]'::jsonb
      ),
      false
    );
  end if;

  v_modifiers := v_payload #> '{phase9_inputs,rider_modifiers}';
  if jsonb_typeof(v_modifiers) = 'array' then
    v_payload := jsonb_set(
      v_payload,
      '{phase9_inputs,rider_modifiers}',
      coalesce(
        (
          select jsonb_agg(value - 'equipment_selection' order by ordinality)
          from jsonb_array_elements(v_modifiers) with ordinality as e(value, ordinality)
        ),
        '[]'::jsonb
      ),
      false
    );
  end if;

  if v_simulation_run_id is not null then
    begin
      perform public.universal_race_stage_survival_heartbeat_v1(
        p_stage_id,
        v_simulation_run_id,
        'payload_loaded',
        jsonb_build_object(
          'source', 'calculation_payload_rpc',
          'payload_bytes', pg_column_size(v_payload)
        )
      );
    exception when others then
      null;
    end;
  end if;

  return v_payload;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_pass2_resume_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run_id uuid;
  v_stage_id uuid;
  v_phase text;
  v_status text;
  v_failed_at timestamptz;
  v_error_message text;
  v_has_scenario boolean := false;
  v_scenario_mode text := 'none';
  v_attempt_count integer := 0;
  v_max_attempts integer := 3;
  v_heartbeat_at timestamptz;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('universal_race_pass2_claim_v3_same_input', 0)
  );

  select s.id,
         s.stage_id,
         coalesce(s.result_summary_json->>'survival_phase',''),
         s.status,
         s.failed_at,
         s.error_message,
         exists (
           select 1
           from public.race_engine_scenario_runs sc
           where sc.simulation_run_id=s.id
             and sc.selection_status='reserved'
         ),
         case
           when coalesce(s.result_summary_json->>'pass2_attempt_count','') ~ '^[0-9]+$'
             then (s.result_summary_json->>'pass2_attempt_count')::integer
           else 0
         end,
         coalesce(
           (s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
           s.updated_at,s.started_at,s.created_at
         )
    into v_run_id,v_stage_id,v_phase,v_status,v_failed_at,v_error_message,
         v_has_scenario,v_attempt_count,v_heartbeat_at
  from public.race_stage_simulation_runs s
  where coalesce(s.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
    and not exists (
      select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.stage_id
    )
    and not exists (
      select 1
      from public.race_stage_safe_calculation_v1 sf
      where sf.stage_id=s.stage_id
        and sf.simulation_run_id=s.id
        and sf.status in ('pending','running')
    )
    and not exists (
      select 1
      from public.race_stage_safe_calculation_v1 sf
      where sf.stage_id=s.stage_id
        and sf.simulation_run_id=s.id
        and sf.status in ('pending','running')
    )
    and coalesce(s.result_summary_json->>'survival_phase','') <> 'pass2_retry_exhausted'
    and (
      exists (
        select 1
        from public.race_engine_scenario_runs sc
        where sc.simulation_run_id=s.id
          and sc.selection_status='reserved'
      )
      or coalesce(s.result_summary_json->>'pass2_scenario_mode','')='none'
      or coalesce(s.result_summary_json->>'survival_phase','')='pass1_ready_no_scenario'
      or (
        s.status='failed'
        and s.failed_at > clock_timestamp()-interval '2 hours'
      )
    )
    and (
      (
        s.status='running'
        and (
          (
            coalesce(s.result_summary_json->>'survival_phase','') in ('scenario_reserved','pass1_ready_no_scenario')
            and coalesce(
              (s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
              s.updated_at,s.started_at,s.created_at
            ) < clock_timestamp()-interval '5 seconds'
          )
          or (
            coalesce(s.result_summary_json->>'survival_phase','')='pass2_resume_failed'
            and coalesce(
              (s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
              s.updated_at,s.started_at,s.created_at
            ) < clock_timestamp()-interval '10 seconds'
          )
          or (
            coalesce(s.result_summary_json->>'survival_phase','') in (
              'pass2_resume_claimed','pass2_payload_loading',
              'primary_engine_started','fallback_engine_started',
              'primary_engine_finished','fallback_engine_finished','submitting'
            )
            and coalesce(
              (s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
              s.updated_at,s.started_at,s.created_at
            ) < clock_timestamp()-interval '90 seconds'
          )
        )
      )
      or (
        s.status='failed'
        and s.failed_at > clock_timestamp()-interval '2 hours'
        and (
          (
            coalesce(s.result_summary_json->>'survival_phase','') in (
              'pass1_resume_claimed','pass1_payload_loading','pass1_started'
            )
            and s.error_message='Race calculation survival watchdog recovered an expired calculation lease.'
          )
          or coalesce(s.result_summary_json->>'survival_phase','') in (
            'pass2_resume_claimed','pass2_payload_loading',
            'primary_engine_started','fallback_engine_started',
            'primary_engine_finished','fallback_engine_finished',
            'submitting','pass2_resume_failed'
          )
        )
      )
    )
  order by coalesce(s.failed_at,s.started_at,s.created_at) asc
  for update of s skip locked
  limit 1;

  if v_run_id is null then
    return jsonb_build_object('status','idle');
  end if;


  if v_phase in ('primary_engine_started','fallback_engine_started')
     and (
       v_status='failed'
       or v_heartbeat_at < clock_timestamp()-interval '45 seconds'
     )
  then
    perform public.universal_race_stage_enable_safe_mode_v1(
      v_stage_id,
      v_run_id,
      'checkpointed_safe_mode_after_first_engine_failure',
      0
    );
    perform public.universal_race_stage_kick_safe_worker_v1();

    return jsonb_build_object(
      'status','safe_mode_activated',
      'stage_id',v_stage_id,
      'simulation_run_id',v_run_id,
      'previous_phase',v_phase,
      'previous_error',v_error_message,
      'recovery_policy','checkpointed_safe_mode_v1'
    );
  end if;

  if v_status='failed'
     and v_phase in (
       'primary_engine_started','fallback_engine_started',
       'primary_engine_finished','fallback_engine_finished',
       'pass2_resume_failed'
     )
  then
    perform public.universal_race_stage_enable_safe_mode_v1(
      v_stage_id,
      v_run_id,
      'checkpointed_safe_mode_after_first_engine_failure',
      0
    );
    perform public.universal_race_stage_kick_safe_worker_v1();

    return jsonb_build_object(
      'status','safe_mode_activated',
      'stage_id',v_stage_id,
      'simulation_run_id',v_run_id,
      'previous_phase',v_phase,
      'previous_error',v_error_message,
      'recovery_policy','checkpointed_safe_mode_v1'
    );
  end if;

  if v_attempt_count >= v_max_attempts then
    update public.race_stage_simulation_runs
       set status='failed',
           failed_at=clock_timestamp(),
           error_message='Pass 2 retry limit exhausted while preserving the full race input/scenario.',
           result_summary_json=coalesce(result_summary_json,'{}'::jsonb)
             || jsonb_build_object(
                  'calculation_status','failed',
                  'survival_phase','pass2_retry_exhausted',
                  'pass2_attempt_count',v_attempt_count,
                  'pass2_retry_exhausted_at_real',clock_timestamp(),
                  'recovery_policy','same_full_input_or_quarantine_v1',
                  'error_details',jsonb_build_object(
                    'reason','pass2_retry_exhausted',
                    'max_attempts',v_max_attempts,
                    'previous_phase',v_phase,
                    'previous_error',v_error_message,
                    'scenario_preserved',v_has_scenario
                  ),
                  'verification_only',false
                ),
           updated_at=clock_timestamp()
     where id=v_run_id;

    update public.race_stage_automation_state
       set last_status='failed',
           last_error='Pass 2 retry limit exhausted while preserving the full race input/scenario.',
           last_checked_at=clock_timestamp(),
           details=coalesce(details,'{}'::jsonb)
             || jsonb_build_object(
                  'survival_phase','pass2_retry_exhausted',
                  'pass2_attempt_count',v_attempt_count,
                  'recovery_policy','same_full_input_or_quarantine_v1',
                  'scenario_preserved',v_has_scenario,
                  'pass2_retry_exhausted_at_real',clock_timestamp()
                ),
           updated_at=clock_timestamp()
     where stage_id=v_stage_id
       and simulation_run_id=v_run_id;

    insert into public.race_stage_calculation_quarantine_v1(
      stage_id,reason,attempt_count,quarantined_at,details
    )
    values(
      v_stage_id,
      'pass2_retry_exhausted_same_full_input',
      v_attempt_count,
      clock_timestamp(),
      jsonb_build_object(
        'simulation_run_id',v_run_id,
        'previous_phase',v_phase,
        'previous_error',v_error_message,
        'max_attempts',v_max_attempts,
        'scenario_preserved',v_has_scenario,
        'recovery_policy','same_full_input_or_quarantine_v1'
      )
    )
    on conflict(stage_id) do update
      set reason=excluded.reason,
          attempt_count=excluded.attempt_count,
          quarantined_at=excluded.quarantined_at,
          details=excluded.details;

    return jsonb_build_object(
      'status','retry_exhausted',
      'stage_id',v_stage_id,
      'simulation_run_id',v_run_id,
      'pass2_attempt_count',v_attempt_count,
      'max_attempts',v_max_attempts,
      'recovery_policy','same_full_input_or_quarantine_v1'
    );
  end if;

  if v_status='failed' then
    update public.race_stage_simulation_runs
       set status='running',
           failed_at=null,
           error_message=null,
           result_summary_json=coalesce(result_summary_json,'{}'::jsonb)
             || jsonb_build_object(
                  'pass2_resume_recovery',jsonb_build_object(
                    'recovered_from_status',v_status,
                    'watchdog_failed_at_real',v_failed_at,
                    'watchdog_error',v_error_message,
                    'recovered_at_real',clock_timestamp(),
                    'same_full_input',true,
                    'scenario_preserved',v_has_scenario,
                    'emergency_fallback',false
                  )
                ),
           updated_at=clock_timestamp()
     where id=v_run_id;
  end if;

  v_scenario_mode := case when v_has_scenario then 'reserved' else 'none' end;
  v_attempt_count := v_attempt_count + 1;

  update public.race_stage_simulation_runs
     set result_summary_json=coalesce(result_summary_json,'{}'::jsonb)
       || jsonb_build_object(
            'pass2_scenario_mode',v_scenario_mode,
            'pass2_attempt_count',v_attempt_count,
            'pass2_last_attempt_at_real',clock_timestamp(),
            'pass2_retry_guard_version','pass2_retry_guard_v3_same_full_input',
            'recovery_policy','same_full_input_or_quarantine_v1'
          ),
         updated_at=clock_timestamp()
   where id=v_run_id;

  perform public.universal_race_stage_survival_heartbeat_v1(
    v_stage_id,
    v_run_id,
    'pass2_resume_claimed',
    jsonb_build_object(
      'source','pass2_resume_worker_v19',
      'previous_phase',v_phase,
      'recovered_failed_run',v_status='failed',
      'scenario_mode',v_scenario_mode,
      'scenario_preserved',v_has_scenario,
      'emergency_fallback',false,
      'pass2_attempt_count',v_attempt_count,
      'max_pass2_attempts',v_max_attempts,
      'claim_guard','serialized_stale_lease_v3',
      'recovery_policy','same_full_input_or_quarantine_v1'
    )
  );

  return jsonb_build_object(
    'status','claimed',
    'stage_id',v_stage_id,
    'simulation_run_id',v_run_id,
    'previous_phase',v_phase,
    'recovered_failed_run',v_status='failed',
    'scenario_mode',v_scenario_mode,
    'scenario_preserved',v_has_scenario,
    'emergency_fallback',false,
    'pass2_attempt_count',v_attempt_count,
    'max_pass2_attempts',v_max_attempts,
    'recovery_policy','same_full_input_or_quarantine_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_pass1_resume_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run_id uuid;
  v_stage_id uuid;
  v_phase text;
  v_status text;
  v_failed_at timestamptz;
  v_error_message text;
begin
  select s.id,
         s.stage_id,
         coalesce(s.result_summary_json->>'survival_phase',''),
         s.status,
         s.failed_at,
         s.error_message
    into v_run_id, v_stage_id, v_phase, v_status, v_failed_at, v_error_message
  from public.race_stage_simulation_runs s
  where coalesce(s.result_summary_json->>'calculation_contract','') = 'phase11b_claim_pending_v1'
    and not exists (
      select 1 from public.race_stage_authoritative_runs a where a.stage_id = s.stage_id
    )
    and not exists (
      select 1 from public.race_engine_scenario_runs sc
      where sc.simulation_run_id = s.id and sc.selection_status = 'reserved'
    )
    and (
      (
        s.status = 'running'
        and (
          (
            coalesce(s.result_summary_json->>'survival_phase','') in ('pass1_pending','payload_loaded')
            and coalesce((s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz, s.started_at, s.created_at)
                < clock_timestamp() - interval '5 seconds'
          )
          or (
            coalesce(s.result_summary_json->>'survival_phase','') = 'pass1_resume_failed'
            and coalesce((s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz, s.started_at, s.created_at)
                < clock_timestamp() - interval '10 seconds'
          )
          or (
            coalesce(s.result_summary_json->>'survival_phase','') in ('pass1_resume_claimed','pass1_payload_loading','pass1_started')
            and coalesce((s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz, s.started_at, s.created_at)
                < clock_timestamp() - interval '5 minutes'
          )
        )
      )
      or (
        s.status = 'failed'
        and coalesce(s.result_summary_json->>'survival_phase','') in (
          'pass1_pending','payload_loaded','pass1_resume_failed','pass1_resume_claimed','pass1_payload_loading','pass1_started'
        )
        and s.failed_at > clock_timestamp() - interval '2 hours'
        and (
          (
            coalesce(s.result_summary_json->>'survival_phase','') = 'pass1_resume_failed'
            and coalesce(s.result_summary_json#>>'{error_details,reason}','') <> 'pass1_engine_exception'
          )
          or (
            s.error_message = 'Race calculation survival watchdog recovered an expired calculation lease.'
            and coalesce(s.result_summary_json->>'survival_phase','') in ('pass1_pending','payload_loaded')
          )
        )
      )
    )
  order by coalesce(s.failed_at, s.started_at, s.created_at) asc
  for update of s skip locked
  limit 1;

  if v_run_id is null then
    return jsonb_build_object('status','idle');
  end if;

  if v_status = 'failed' then
    update public.race_stage_simulation_runs
       set status = 'running',
           failed_at = null,
           error_message = null,
           result_summary_json = coalesce(result_summary_json, '{}'::jsonb)
             || jsonb_build_object(
                  'pass1_resume_recovery', jsonb_build_object(
                    'recovered_from_status', v_status,
                    'watchdog_failed_at_real', v_failed_at,
                    'watchdog_error', v_error_message,
                    'recovered_at_real', clock_timestamp()
                  )
                ),
           updated_at = clock_timestamp()
     where id = v_run_id;
  end if;

  perform public.universal_race_stage_survival_heartbeat_v1(
    v_stage_id,
    v_run_id,
    'pass1_resume_claimed',
    jsonb_build_object(
      'source','pass1_resume_worker',
      'previous_phase',v_phase,
      'recovered_failed_run',v_status = 'failed'
    )
  );

  return jsonb_build_object(
    'status','claimed',
    'stage_id',v_stage_id,
    'simulation_run_id',v_run_id,
    'previous_phase',v_phase,
    'recovered_failed_run',v_status = 'failed'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_finalize_ready_scenarios_v1(p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_row record;
  v_result jsonb;
  v_classification jsonb;
  v_checkpoints jsonb;
  v_outcome jsonb;
  v_finalize jsonb;
  v_results jsonb := '[]'::jsonb;
  v_finalized integer := 0;
  v_failed integer := 0;
  v_same_time integer;
  v_max_gap numeric;
begin
  for v_row in
    select s.stage_id, s.simulation_run_id,
           r.result_summary_json #> '{output_snapshot,universalResult}' as universal_result
    from public.race_engine_scenario_runs s
    join public.race_stage_simulation_runs r
      on r.id = s.simulation_run_id
     and r.stage_id = s.stage_id
    where s.selection_status = 'reserved'
      and jsonb_typeof(r.result_summary_json #> '{output_snapshot,universalResult}') = 'object'
      and jsonb_typeof(r.result_summary_json #> '{output_snapshot,universalResult,finishResolution,classification}') = 'array'
      and jsonb_array_length(r.result_summary_json #> '{output_snapshot,universalResult,finishResolution,classification}') > 0
    order by r.updated_at asc
    limit greatest(1, least(coalesce(p_limit,8), 32))
  loop
    begin
      v_result := v_row.universal_result;
      v_classification := coalesce(v_result #> '{finishResolution,classification}', '[]'::jsonb);
      v_checkpoints := case
        when jsonb_typeof(v_result #> '{replayTimeline,checkpoints}') = 'array'
          then v_result #> '{replayTimeline,checkpoints}'
        else '[]'::jsonb
      end;

      select count(*) filter (
               where coalesce(
                 nullif(e->>'gapSeconds','')::numeric,
                 nullif(e->>'officialGapSeconds','')::numeric,
                 0
               ) <= 0.5
             ),
             coalesce(max(coalesce(
               nullif(e->>'gapSeconds','')::numeric,
               nullif(e->>'officialGapSeconds','')::numeric,
               0
             )),0)
      into v_same_time, v_max_gap
      from jsonb_array_elements(v_classification) e;

      v_outcome := jsonb_build_object(
        'winner_rider_id', v_classification -> 0 ->> 'riderId',
        'classification_rider_count', jsonb_array_length(v_classification),
        'same_time_rider_count', coalesce(v_same_time,0),
        'max_gap_seconds', coalesce(v_max_gap,0),
        'replay_checkpoint_count', jsonb_array_length(v_checkpoints),
        'finalization_source', 'persisted_result_lifecycle_v1'
      );

      v_finalize := public.universal_race_stage_finalize_scenario_v1(
        v_row.stage_id,
        v_row.simulation_run_id,
        v_outcome,
        '[]'::jsonb
      );

      if coalesce(v_finalize->>'status','') = 'completed' then
        v_finalized := v_finalized + 1;
      else
        v_failed := v_failed + 1;
      end if;
      v_results := v_results || jsonb_build_array(v_finalize);
    exception when others then
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'status','failed',
        'stage_id',v_row.stage_id,
        'simulation_run_id',v_row.simulation_run_id,
        'error',sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'status','completed',
    'finalized_count',v_finalized,
    'failed_count',v_failed,
    'results',v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_calculation_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_attempts integer := 0;
  v_has_authority boolean := false;
begin
  if p_stage_id is null then
    return jsonb_build_object('status','blocked','reason','stage_id_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('phase11b_circuit_breaker:'||p_stage_id::text,0));

  if exists (
    select 1 from public.race_stage_calculation_quarantine_v1 q where q.stage_id=p_stage_id
  ) then
    return jsonb_build_object(
      'status','blocked','reason','stage_auto_quarantined','stage_id',p_stage_id,
      'worker_model','per_stage_circuit_breaker_v1'
    );
  end if;

  select count(*)::integer into v_attempts
  from public.race_stage_simulation_runs s
  where s.stage_id=p_stage_id
    and s.engine_version='race_engine_ts_v1'
    and s.simulation_mode='deterministic_road_race_v1';

  select exists(
    select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id
  ) into v_has_authority;

  if not v_has_authority and v_attempts >= 12 then
    insert into public.race_stage_calculation_quarantine_v1(stage_id,reason,attempt_count,details)
    values(
      p_stage_id,
      'automatic_attempt_limit_exceeded',
      v_attempts,
      jsonb_build_object(
        'threshold',12,
        'model','per_stage_circuit_breaker_v1',
        'quarantined_at_real',clock_timestamp()
      )
    )
    on conflict(stage_id) do update
      set reason=excluded.reason,
          attempt_count=excluded.attempt_count,
          quarantined_at=clock_timestamp(),
          details=excluded.details;

    update public.race_stage_simulation_runs s
       set status='failed',
           failed_at=coalesce(s.failed_at,clock_timestamp()),
           error_message='Automatic calculation quarantined after excessive attempts; unrelated stages remain eligible.',
           result_summary_json=coalesce(s.result_summary_json,'{}'::jsonb)
             || jsonb_build_object(
                  'survival_phase','auto_quarantined_excessive_attempts',
                  'calculation_status','quarantined',
                  'auto_quarantine_model','per_stage_circuit_breaker_v1',
                  'auto_quarantine_attempt_count',v_attempts,
                  'auto_quarantined_at_real',clock_timestamp()
                ),
           updated_at=clock_timestamp()
     where s.stage_id=p_stage_id
       and s.engine_version='race_engine_ts_v1'
       and s.simulation_mode='deterministic_road_race_v1'
       and s.status in ('running','failed')
       and not exists (
         select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.stage_id
       );

    return jsonb_build_object(
      'status','blocked','reason','stage_auto_quarantined','stage_id',p_stage_id,
      'attempt_count',v_attempts,'attempt_limit',12,
      'worker_model','per_stage_circuit_breaker_v1'
    );
  end if;

  return public.universal_race_stage_claim_calculation_v2_impl(p_stage_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_universal_race_stage_replay_availability_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_calculation_due_game_at timestamp without time zone;
  v_calculation_lead_hours integer := 3;

  v_state_run_id uuid;
  v_state_status text;
  v_state_error text;
  v_state_details jsonb := '{}'::jsonb;

  v_run_id uuid;
  v_run_race_id uuid;
  v_run_status text;

  v_calculated boolean := false;
  v_replay_closes_at_real timestamptz;
  v_results_published boolean := false;
  v_replay_window_elapsed boolean := false;
  v_results_visible boolean := false;
begin
  select coalesce(control.typescript_calculation_lead_hours, 3)::integer
  into v_calculation_lead_hours
  from public.race_engine_runtime_control_v1 control
  where control.singleton_id = true;

  select
    stage.stage_date::timestamp
      + make_interval(
          hours => coalesce(stage.planned_start_hour_number, 12),
          mins => coalesce(stage.planned_start_minute, 0)
        )
  into v_stage_start_game_at
  from public.race_stages stage
  where stage.id = p_stage_id;

  if v_stage_start_game_at is null then
    return jsonb_build_object(
      'status', 'not_available',
      'reason', 'stage_not_found_or_unscheduled',
      'stage_id', p_stage_id,
      'calculated', false,
      'browser_calculation_allowed', false
    );
  end if;

  v_calculation_due_game_at := v_stage_start_game_at
    - make_interval(hours => coalesce(v_calculation_lead_hours, 3));

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  select
    state.simulation_run_id,
    state.last_status,
    state.last_error,
    coalesce(state.details, '{}'::jsonb)
  into
    v_state_run_id,
    v_state_status,
    v_state_error,
    v_state_details
  from public.race_stage_automation_state state
  where state.stage_id = p_stage_id;

  if v_state_run_id is not null then
    select
      run.id,
      run.race_id,
      run.status
    into
      v_run_id,
      v_run_race_id,
      v_run_status
    from public.race_stage_simulation_runs run
    where run.id = v_state_run_id
      and run.stage_id = p_stage_id
      and run.engine_version = 'race_engine_ts_v1'
      and run.simulation_mode = 'deterministic_road_race_v1'
      and run.status in ('running', 'completed')
    limit 1;
  end if;

  if v_run_id is null then
    select
      run.id,
      run.race_id,
      run.status
    into
      v_run_id,
      v_run_race_id,
      v_run_status
    from public.race_stage_simulation_runs run
    where run.stage_id = p_stage_id
      and run.engine_version = 'race_engine_ts_v1'
      and run.simulation_mode = 'deterministic_road_race_v1'
      and run.status = 'completed'
    order by run.updated_at desc, run.created_at desc, run.id desc
    limit 1;
  end if;

  v_calculated :=
    v_run_id is not null
    and (
      v_run_status = 'completed'
      or coalesce(v_state_status, '') in (
        'calculated_hidden',
        'replay_live',
        'published'
      )
    );

  if not v_calculated then
    return jsonb_build_object(
      'status', 'not_available',
      'reason', case
        when v_current_game_at < v_calculation_due_game_at
          then 'awaiting_calculation_window'
        else 'awaiting_backend_calculation'
      end,
      'stage_id', p_stage_id,
      'calculated', false,
      'current_game_at', v_current_game_at,
      'calculation_due_game_at', v_calculation_due_game_at,
      'replay_opens_game_at', v_stage_start_game_at,
      'browser_calculation_allowed', false
    );
  end if;

  if v_current_game_at < v_stage_start_game_at then
    return jsonb_build_object(
      'status', 'not_open',
      'stage_id', p_stage_id,
      'race_id', v_run_race_id,
      'calculated', true,
      'simulation_run_id', v_run_id,
      'replay_opens_game_at', v_stage_start_game_at,
      'results_visible', false,
      'browser_calculation_allowed', false
    );
  end if;

  v_replay_closes_at_real := nullif(
    v_state_details ->> 'replay_closes_at_real',
    ''
  )::timestamptz;

  v_results_published :=
    v_run_status = 'completed'
    or coalesce(v_state_status, '') = 'published';

  v_replay_window_elapsed :=
    v_replay_closes_at_real is not null
    and now() >= v_replay_closes_at_real;

  v_results_visible := v_results_published or v_replay_window_elapsed;

  return jsonb_build_object(
    'status', 'available',
    'stage_id', p_stage_id,
    'race_id', v_run_race_id,
    'calculated', true,
    'simulation_run_id', v_run_id,
    'replay_opens_game_at', v_stage_start_game_at,
    'results_visible', v_results_visible,
    'publication_pending',
      v_replay_window_elapsed and not v_results_published,
    'publication_error', v_state_error,
    'browser_calculation_allowed', false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.inbox_send_admin_season_message_to_user_v1(p_user_id uuid, p_season_number integer, p_subject text, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_conversation_id uuid;
begin
  if p_season_number is null or p_season_number < 1 then
    raise exception 'Valid season number is required';
  end if;

  if coalesce(length(trim(p_subject)), 0) = 0 then
    raise exception 'Subject is required';
  end if;

  if coalesce(length(trim(p_body)), 0) = 0 then
    raise exception 'Message body is required';
  end if;

  v_conversation_id := public.inbox_get_or_create_admin_conversation(p_user_id);

  update public.inbox_conversations
  set subject = trim(p_subject)
  where id = v_conversation_id;

  insert into public.inbox_messages (
    conversation_id,
    sender_user_id,
    sender_kind,
    sender_label,
    body,
    game_season_number
  )
  values (
    v_conversation_id,
    null,
    'admin',
    'Admin',
    trim(p_body),
    p_season_number
  );

  return v_conversation_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.inbox_clear_future_season_system_state_v1(p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_affected_conversations uuid[] := array[]::uuid[];
  v_deleted_messages integer := 0;
  v_deleted_guard_rows integer := 0;
  v_deleted_empty_conversations integer := 0;
begin
  if p_target_season is null or p_target_season < 1 then
    raise exception 'Valid target season is required';
  end if;

  select coalesce(array_agg(distinct m.conversation_id), array[]::uuid[])
  into v_affected_conversations
  from public.inbox_messages m
  join public.inbox_conversations c
    on c.id = m.conversation_id
  where c.conversation_type = 'admin_direct'
    and m.sender_kind = 'admin'
    and (
      coalesce(m.game_season_number, 0) > p_target_season
      or coalesce(
        nullif(
          substring(
            m.body
            from 'refreshed for Season ([0-9]+)\.'
          ),
          ''
        )::integer,
        0
      ) > p_target_season
      or (
        p_target_season = 1
        and m.body =
          'Welcome to the new season. Seasonal standings have been refreshed. Open the game to review your club status, new objectives, and current competition.'
      )
    );

  delete from public.inbox_messages m
  using public.inbox_conversations c
  where c.id = m.conversation_id
    and c.conversation_type = 'admin_direct'
    and m.sender_kind = 'admin'
    and (
      coalesce(m.game_season_number, 0) > p_target_season
      or coalesce(
        nullif(
          substring(
            m.body
            from 'refreshed for Season ([0-9]+)\.'
          ),
          ''
        )::integer,
        0
      ) > p_target_season
      or (
        p_target_season = 1
        and m.body =
          'Welcome to the new season. Seasonal standings have been refreshed. Open the game to review your club status, new objectives, and current competition.'
      )
    );

  get diagnostics v_deleted_messages = row_count;

  delete from public.inbox_season_start_guard
  where season_number > p_target_season;

  get diagnostics v_deleted_guard_rows = row_count;

  if cardinality(v_affected_conversations) > 0 then
    update public.inbox_conversations c
    set
      subject = 'Admin',
      last_message_at = (
        select max(m.created_at)
        from public.inbox_messages m
        where m.conversation_id = c.id
      ),
      updated_at = clock_timestamp()
    where c.id = any(v_affected_conversations)
      and exists (
        select 1
        from public.inbox_messages m
        where m.conversation_id = c.id
      );

    delete from public.inbox_conversation_participants cp
    where cp.conversation_id = any(v_affected_conversations)
      and not exists (
        select 1
        from public.inbox_messages m
        where m.conversation_id = cp.conversation_id
      );

    delete from public.inbox_conversations c
    where c.id = any(v_affected_conversations)
      and not exists (
        select 1
        from public.inbox_messages m
        where m.conversation_id = c.id
      );

    get diagnostics v_deleted_empty_conversations = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'target_season', p_target_season,
    'deleted_messages', v_deleted_messages,
    'deleted_guard_rows', v_deleted_guard_rows,
    'deleted_empty_admin_conversations', v_deleted_empty_conversations
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_app_admin_v1()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_email text;
begin
  if v_user_id is null then
    return false;
  end if;

  select lower(trim(coalesce(u.email, '')))
  into v_email
  from auth.users u
  where u.id = v_user_id;

  if coalesce(v_email, '') = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.app_admins a
    where a.is_active = true
      and (
        a.user_id = v_user_id
        or lower(a.email) = v_email
      )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_site_analytics_event_v1(p_visitor_id uuid, p_session_id uuid, p_path text, p_country_code text, p_device_type text, p_referrer_host text DEFAULT NULL::text, p_hostname text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_now timestamptz := clock_timestamp();
  v_date date := (clock_timestamp() at time zone 'UTC')::date;
  v_user_id uuid := auth.uid();
  v_path text;
  v_country text;
  v_device text;
  v_referrer text;
  v_hostname text;
begin
  v_hostname := lower(trim(coalesce(p_hostname, '')));

  -- Production site only. Preview deployments, localhost and staging are rejected.
  if v_hostname not in ('propelotonmanager.com', 'www.propelotonmanager.com') then
    return false;
  end if;

  if p_visitor_id is null or p_session_id is null then
    return false;
  end if;

  v_path := split_part(trim(coalesce(p_path, '/')), '?', 1);
  v_path := split_part(v_path, '#', 1);

  if v_path = '' then
    v_path := '/';
  end if;

  if left(v_path, 1) <> '/' then
    v_path := '/' || v_path;
  end if;

  v_path := left(v_path, 300);

  -- Never count administrators opening the analytics dashboard itself.
  if v_path = '/dashboard/admin/analytics'
     or v_path like '/dashboard/admin/analytics/%' then
    return false;
  end if;

  v_country := upper(trim(coalesce(p_country_code, 'XX')));
  if v_country !~ '^[A-Z]{2}$' then
    v_country := 'XX';
  end if;

  v_device := lower(trim(coalesce(p_device_type, '')));
  if v_device not in ('desktop','tablet','mobile') then
    v_device := 'desktop';
  end if;

  v_referrer := lower(trim(coalesce(p_referrer_host, '')));
  if v_referrer = '' or v_referrer = v_hostname
     or v_referrer in ('propelotonmanager.com','www.propelotonmanager.com') then
    v_referrer := null;
  else
    v_referrer := left(v_referrer, 255);
  end if;

  insert into public.site_analytics_daily_visitors (
    analytics_date,
    visitor_id,
    user_id,
    country_code,
    device_type,
    first_seen_at,
    last_seen_at,
    pageview_count
  )
  values (
    v_date,
    p_visitor_id,
    v_user_id,
    v_country,
    v_device,
    v_now,
    v_now,
    1
  )
  on conflict (analytics_date, visitor_id) do update
  set
    user_id = coalesce(excluded.user_id, public.site_analytics_daily_visitors.user_id),
    country_code = case
      when excluded.country_code <> 'XX' then excluded.country_code
      else public.site_analytics_daily_visitors.country_code
    end,
    device_type = excluded.device_type,
    first_seen_at = least(public.site_analytics_daily_visitors.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(public.site_analytics_daily_visitors.last_seen_at, excluded.last_seen_at),
    pageview_count = public.site_analytics_daily_visitors.pageview_count + 1;

  insert into public.site_analytics_daily_sessions (
    analytics_date,
    session_id,
    visitor_id,
    user_id,
    country_code,
    device_type,
    referrer_host,
    started_at,
    last_seen_at,
    pageview_count
  )
  values (
    v_date,
    p_session_id,
    p_visitor_id,
    v_user_id,
    v_country,
    v_device,
    v_referrer,
    v_now,
    v_now,
    1
  )
  on conflict (analytics_date, session_id) do update
  set
    visitor_id = excluded.visitor_id,
    user_id = coalesce(excluded.user_id, public.site_analytics_daily_sessions.user_id),
    country_code = case
      when excluded.country_code <> 'XX' then excluded.country_code
      else public.site_analytics_daily_sessions.country_code
    end,
    device_type = excluded.device_type,
    referrer_host = coalesce(public.site_analytics_daily_sessions.referrer_host, excluded.referrer_host),
    started_at = least(public.site_analytics_daily_sessions.started_at, excluded.started_at),
    last_seen_at = greatest(public.site_analytics_daily_sessions.last_seen_at, excluded.last_seen_at),
    pageview_count = public.site_analytics_daily_sessions.pageview_count + 1;

  insert into public.site_analytics_daily_pages (
    analytics_date,
    visitor_id,
    path,
    pageview_count,
    first_seen_at,
    last_seen_at
  )
  values (
    v_date,
    p_visitor_id,
    v_path,
    1,
    v_now,
    v_now
  )
  on conflict (analytics_date, visitor_id, path) do update
  set
    pageview_count = public.site_analytics_daily_pages.pageview_count + 1,
    first_seen_at = least(public.site_analytics_daily_pages.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(public.site_analytics_daily_pages.last_seen_at, excluded.last_seen_at);

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_analytics_dashboard_v1(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_end_date date := (clock_timestamp() at time zone 'UTC')::date;
  v_start_date date;
  v_days integer := coalesce(p_days, 30);
  v_result jsonb;
begin
  if not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if v_days not in (0, 7, 30, 90, 365) then
    raise exception 'Unsupported analytics period. Use 7, 30, 90, 365 or 0 for all time.';
  end if;

  if v_days = 0 then
    select least(
      coalesce(
        (select min(v.analytics_date) from public.site_analytics_daily_visitors v),
        v_end_date
      ),
      coalesce(
        (
          select min((u.created_at at time zone 'UTC')::date)
          from auth.users u
          where u.deleted_at is null
            and lower(coalesce(u.email,'')) not like 'deleted_%@deleted.local'
        ),
        v_end_date
      )
    )
    into v_start_date;
  else
    v_start_date := v_end_date - (v_days - 1);
  end if;

  select jsonb_build_object(
    'timezone', 'UTC',
    'start_date', v_start_date,
    'end_date', v_end_date,
    'days', v_days,
    'summary', jsonb_build_object(
      'unique_visitors', (
        select count(distinct v.visitor_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
      ),
      'pageviews', (
        select coalesce(sum(v.pageview_count),0)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
      ),
      'sessions', (
        select count(distinct s.session_id)
        from public.site_analytics_daily_sessions s
        where s.analytics_date between v_start_date and v_end_date
      ),
      'registered_active_users', (
        select count(distinct v.user_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
          and v.user_id is not null
      ),
      'anonymous_visitors', (
        select count(distinct v.visitor_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
          and v.user_id is null
          and not exists (
            select 1
            from public.site_analytics_daily_visitors vr
            where vr.analytics_date between v_start_date and v_end_date
              and vr.visitor_id = v.visitor_id
              and vr.user_id is not null
          )
      ),
      'new_registrations', (
        select count(*)
        from auth.users u
        where u.deleted_at is null
          and lower(coalesce(u.email,'')) not like 'deleted_%@deleted.local'
          and (u.created_at at time zone 'UTC')::date
              between v_start_date and v_end_date
      ),
      'total_registered_accounts', (
        select count(*)
        from auth.users u
        where u.deleted_at is null
          and lower(coalesce(u.email,'')) not like 'deleted_%@deleted.local'
      ),
      'dau', (
        select count(distinct v.user_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date = v_end_date
          and v.user_id is not null
      ),
      'wau', (
        select count(distinct v.user_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_end_date - 6 and v_end_date
          and v.user_id is not null
      ),
      'mau', (
        select count(distinct v.user_id)
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_end_date - 29 and v_end_date
          and v.user_id is not null
      )
    ),
    'daily', (
      with calendar as (
        select generate_series(
          v_start_date::timestamp,
          v_end_date::timestamp,
          interval '1 day'
        )::date as analytics_date
      ),
      visitors as (
        select
          v.analytics_date,
          count(distinct v.visitor_id) as unique_visitors,
          coalesce(sum(v.pageview_count),0) as pageviews,
          count(distinct v.user_id) filter (where v.user_id is not null)
            as active_registered_users
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
        group by v.analytics_date
      ),
      sessions as (
        select
          s.analytics_date,
          count(distinct s.session_id) as sessions
        from public.site_analytics_daily_sessions s
        where s.analytics_date between v_start_date and v_end_date
        group by s.analytics_date
      ),
      registrations as (
        select
          (u.created_at at time zone 'UTC')::date as analytics_date,
          count(*) as new_registrations
        from auth.users u
        where u.deleted_at is null
          and lower(coalesce(u.email,'')) not like 'deleted_%@deleted.local'
          and (u.created_at at time zone 'UTC')::date
              between v_start_date and v_end_date
        group by 1
      )
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'date', c.analytics_date,
            'unique_visitors', coalesce(v.unique_visitors,0),
            'pageviews', coalesce(v.pageviews,0),
            'sessions', coalesce(s.sessions,0),
            'active_registered_users', coalesce(v.active_registered_users,0),
            'new_registrations', coalesce(r.new_registrations,0)
          )
          order by c.analytics_date
        ),
        '[]'::jsonb
      )
      from calendar c
      left join visitors v using (analytics_date)
      left join sessions s using (analytics_date)
      left join registrations r using (analytics_date)
    ),
    'countries', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'country_code', q.country_code,
            'country_name', q.country_name,
            'unique_visitors', q.unique_visitors,
            'pageviews', q.pageviews
          )
          order by q.unique_visitors desc, q.pageviews desc, q.country_code
        ),
        '[]'::jsonb
      )
      from (
        select
          v.country_code,
          coalesce(c.name, case when v.country_code='XX' then 'Unknown' else v.country_code end)
            as country_name,
          count(distinct v.visitor_id) as unique_visitors,
          coalesce(sum(v.pageview_count),0) as pageviews
        from public.site_analytics_daily_visitors v
        left join public.countries c on c.code = v.country_code
        where v.analytics_date between v_start_date and v_end_date
        group by v.country_code, c.name
        order by unique_visitors desc, pageviews desc
        limit 100
      ) q
    ),
    'top_pages', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'path', q.path,
            'pageviews', q.pageviews,
            'unique_visitors', q.unique_visitors
          )
          order by q.pageviews desc, q.unique_visitors desc, q.path
        ),
        '[]'::jsonb
      )
      from (
        select
          p.path,
          coalesce(sum(p.pageview_count),0) as pageviews,
          count(distinct p.visitor_id) as unique_visitors
        from public.site_analytics_daily_pages p
        where p.analytics_date between v_start_date and v_end_date
        group by p.path
        order by pageviews desc, unique_visitors desc
        limit 50
      ) q
    ),
    'devices', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'device_type', q.device_type,
            'visitors', q.visitors,
            'pageviews', q.pageviews
          )
          order by q.visitors desc, q.device_type
        ),
        '[]'::jsonb
      )
      from (
        select
          v.device_type,
          count(distinct v.visitor_id) as visitors,
          coalesce(sum(v.pageview_count),0) as pageviews
        from public.site_analytics_daily_visitors v
        where v.analytics_date between v_start_date and v_end_date
        group by v.device_type
      ) q
    ),
    'traffic_sources', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'referrer_host', q.referrer_host,
            'sessions', q.sessions,
            'unique_visitors', q.unique_visitors
          )
          order by q.sessions desc, q.unique_visitors desc, q.referrer_host
        ),
        '[]'::jsonb
      )
      from (
        select
          coalesce(nullif(s.referrer_host,''), 'Direct') as referrer_host,
          count(distinct s.session_id) as sessions,
          count(distinct s.visitor_id) as unique_visitors
        from public.site_analytics_daily_sessions s
        where s.analytics_date between v_start_date and v_end_date
        group by coalesce(nullif(s.referrer_host,''), 'Direct')
        order by sessions desc, unique_visitors desc
        limit 50
      ) q
    )
  )
  into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_bug_report_unread_count_v1()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select count(*)::integer
  into v_count
  from public.bug_reports br
  where not exists (
    select 1
    from public.bug_report_admin_reads r
    where r.bug_report_id = br.id
      and r.admin_user_id = v_admin_user_id
  );

  return coalesce(v_count, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_bug_reports_v1(p_status text DEFAULT NULL::text, p_limit integer DEFAULT 250)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 250), 500));
  v_result jsonb;
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if p_status is not null
     and p_status not in ('open', 'in_progress', 'resolved', 'closed') then
    raise exception 'Invalid bug report status'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'counts',
    jsonb_build_object(
      'total', count(*)::integer,
      'unread', count(*) filter (
        where not exists (
          select 1
          from public.bug_report_admin_reads rr
          where rr.bug_report_id = br.id
            and rr.admin_user_id = v_admin_user_id
        )
      )::integer,
      'open', count(*) filter (where br.status = 'open')::integer,
      'in_progress', count(*) filter (where br.status = 'in_progress')::integer,
      'resolved', count(*) filter (where br.status = 'resolved')::integer,
      'closed', count(*) filter (where br.status = 'closed')::integer
    ),
    'reports',
    coalesce(
      (
        select jsonb_agg(to_jsonb(report_row) order by report_row.created_at desc)
        from (
          select
            b.id,
            b.created_at,
            b.updated_at,
            b.user_id,
            b.page_label,
            b.page_path,
            b.page_url,
            b.description,
            b.severity,
            b.browser,
            b.viewport,
            b.reported_from,
            b.status,
            b.priority,
            b.assigned_admin_id,
            b.resolved_at,
            b.bug_type,
            b.expected_result,
            b.actual_result,
            b.steps_to_reproduce,
            b.screenshot_path,
            b.screenshot_url,
            p.username as reporter_username,
            p.email as reporter_email,
            nullif(trim(concat_ws(' ', p.first_name, p.last_name)), '') as reporter_full_name,
            c.id as club_id,
            c.name as club_name,
            not exists (
              select 1
              from public.bug_report_admin_reads r
              where r.bug_report_id = b.id
                and r.admin_user_id = v_admin_user_id
            ) as is_unread
          from public.bug_reports b
          left join public.profiles p
            on p.id = b.user_id
          left join lateral (
            select club.id, club.name
            from public.clubs club
            where club.owner_user_id = b.user_id
              and club.deleted_at is null
            order by
              case when club.club_type = 'main' then 0 else 1 end,
              club.created_at asc
            limit 1
          ) c on true
          where p_status is null or b.status = p_status
          order by b.created_at desc
          limit v_limit
        ) report_row
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.bug_reports br;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_admin_bug_report_read_v1(p_report_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.bug_reports
    where id = p_report_id
  ) then
    return false;
  end if;

  insert into public.bug_report_admin_reads (
    bug_report_id,
    admin_user_id,
    read_at
  )
  values (
    p_report_id,
    v_admin_user_id,
    now()
  )
  on conflict (bug_report_id, admin_user_id)
  do update set read_at = excluded.read_at;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_bug_report_notes_v1(p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'bug_report_id', n.bug_report_id,
        'admin_user_id', n.admin_user_id,
        'author', coalesce(p.username, p.email, 'Administrator'),
        'note', n.note,
        'created_at', n.created_at
      )
      order by n.created_at asc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.bug_report_notes n
  left join public.profiles p
    on p.id = n.admin_user_id
  where n.bug_report_id = p_report_id;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_add_bug_report_note_v1(p_report_id uuid, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_note_id uuid;
  v_note text := trim(coalesce(p_note, ''));
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if v_note = '' then
    raise exception 'Note cannot be empty'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.bug_reports
    where id = p_report_id
  ) then
    raise exception 'Bug report not found'
      using errcode = 'P0002';
  end if;

  insert into public.bug_report_notes (
    bug_report_id,
    admin_user_id,
    note
  )
  values (
    p_report_id,
    v_admin_user_id,
    v_note
  )
  returning id into v_note_id;

  return v_note_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_update_bug_report_v1(p_report_id uuid, p_status text, p_priority text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_status text := coalesce(nullif(trim(p_status), ''), 'open');
  v_priority text := coalesce(nullif(trim(p_priority), ''), 'normal');
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if v_status not in ('open', 'in_progress', 'resolved', 'closed') then
    raise exception 'Invalid bug report status'
      using errcode = '22023';
  end if;

  if v_priority not in ('low', 'normal', 'high', 'critical') then
    raise exception 'Invalid bug report priority'
      using errcode = '22023';
  end if;

  update public.bug_reports
  set
    status = v_status,
    priority = v_priority,
    updated_at = now(),
    resolved_at = case
      when v_status in ('resolved', 'closed') then coalesce(resolved_at, now())
      else null
    end
  where id = p_report_id;

  return found;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_homepage_review_pending_count_v1()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select count(*)::integer
  into v_count
  from public.homepage_player_reviews
  where status = 'pending';

  return coalesce(v_count, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_enforce_parent_start_time_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_hour integer;
  v_minute integer;
begin
  select r.planned_start_hour_number, coalesce(r.planned_start_minute,0)
    into v_hour, v_minute
  from public.races r
  where r.id = new.race_id;

  if found and v_hour is not null then
    new.planned_start_hour_number := v_hour;
    new.planned_start_minute := v_minute;
    new.planned_start_time_label :=
      lpad(v_hour::text,2,'0') || ':' || lpad(v_minute::text,2,'0');
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_propagate_start_time_to_stages_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_label text;
begin
  if new.planned_start_hour_number is distinct from old.planned_start_hour_number
     or coalesce(new.planned_start_minute,0) is distinct from coalesce(old.planned_start_minute,0)
     or new.planned_start_time_label is distinct from old.planned_start_time_label
  then
    if new.planned_start_hour_number is not null then
      v_label :=
        lpad(new.planned_start_hour_number::text,2,'0')
        || ':'
        || lpad(coalesce(new.planned_start_minute,0)::text,2,'0');
    else
      v_label := new.planned_start_time_label;
    end if;

    update public.race_stages stage
       set planned_start_hour_number = new.planned_start_hour_number,
           planned_start_minute = coalesce(new.planned_start_minute,0),
           planned_start_time_label = v_label,
           updated_at = clock_timestamp()
     where stage.race_id = new.id
       and not exists (
         select 1
         from public.race_stage_authoritative_runs authority
         where authority.stage_id = stage.id
       );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_contact_message_unread_count_v1()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select count(*)::integer
  into v_count
  from public.contact_messages m
  where m.admin_status = 'open'
    and not exists (
      select 1
      from public.contact_message_admin_reads r
      where r.contact_message_id = m.id
        and r.admin_user_id = v_admin_user_id
    );

  return coalesce(v_count, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_contact_messages_v1(p_view text DEFAULT 'open'::text, p_limit integer DEFAULT 250)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
  v_view text := lower(trim(coalesce(p_view, 'open')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 250), 500));
  v_result jsonb;
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if v_view not in ('open','archived','all') then
    raise exception 'Invalid contact message view'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'counts',
    jsonb_build_object(
      'total', count(*)::integer,
      'open', count(*) filter (where m.admin_status = 'open')::integer,
      'archived', count(*) filter (where m.admin_status = 'archived')::integer,
      'unread', count(*) filter (
        where m.admin_status = 'open'
          and not exists (
            select 1
            from public.contact_message_admin_reads rr
            where rr.contact_message_id = m.id
              and rr.admin_user_id = v_admin_user_id
          )
      )::integer,
      'failed_email', count(*) filter (where m.email_status = 'failed')::integer
    ),
    'messages',
    coalesce(
      (
        select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc)
        from (
          select
            cm.id,
            cm.user_id,
            cm.sender_name,
            cm.sender_email,
            cm.message,
            cm.source,
            cm.email_status,
            cm.resend_email_id,
            cm.delivery_error,
            cm.email_sent_at,
            cm.admin_status,
            cm.archived_at,
            cm.archived_by,
            cm.created_at,
            cm.updated_at,
            not exists (
              select 1
              from public.contact_message_admin_reads r
              where r.contact_message_id = cm.id
                and r.admin_user_id = v_admin_user_id
            ) as is_unread
          from public.contact_messages cm
          where
            v_view = 'all'
            or (v_view = 'open' and cm.admin_status = 'open')
            or (v_view = 'archived' and cm.admin_status = 'archived')
          order by cm.created_at desc
          limit v_limit
        ) row_data
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.contact_messages m;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_admin_contact_message_read_v1(p_message_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.contact_messages where id = p_message_id
  ) then
    return false;
  end if;

  insert into public.contact_message_admin_reads (
    contact_message_id,
    admin_user_id,
    read_at
  )
  values (
    p_message_id,
    v_admin_user_id,
    now()
  )
  on conflict (contact_message_id, admin_user_id)
  do update set read_at = excluded.read_at;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_archive_contact_message_v1(p_message_id uuid, p_archived boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_admin_user_id uuid := auth.uid();
begin
  if v_admin_user_id is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  update public.contact_messages
  set
    admin_status = case when p_archived then 'archived' else 'open' end,
    archived_at = case when p_archived then now() else null end,
    archived_by = case when p_archived then v_admin_user_id else null end,
    updated_at = now()
  where id = p_message_id;

  return found;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_operations_refresh_base_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_game_now timestamptz;
  v_history_days integer;
  v_calc_grace integer;
  v_replay_grace integer;
  v_completion_grace integer;
  v_problem_count integer;
  v_row_count integer;
begin
  select
    public.get_current_game_timestamp(),
    history_game_days,
    calculation_grace_game_minutes,
    replay_grace_game_minutes,
    completion_grace_game_minutes
  into
    v_game_now,
    v_history_days,
    v_calc_grace,
    v_replay_grace,
    v_completion_grace
  from public.race_operations_config_v1
  where id = true;

  if v_game_now is null then
    raise exception 'Current game timestamp is unavailable';
  end if;

  with candidates as (
    select
      s.id as stage_id,
      s.race_id,
      r.name as race_name,
      r.category as race_category,
      (coalesce(cr.prize_fund_min_cash, 0) > 0) as prizes_expected,
      coalesce(cr.ranking_points_enabled, true) as ranking_points_enabled,
      s.stage_number,
      s.name as stage_name,
      public.race_stage_planned_start_game_at_v1(s.id) as stage_start_game_at,
      coalesce(s.weather_cancelled, false) as stage_weather_cancelled,
      lower(coalesce(r.status, '')) in ('cancelled','canceled') as race_cancelled
    from public.race_stages s
    join public.races r on r.id = s.race_id
    left join public.race_category_rules cr
      on cr.race_class_code = r.category
    where s.stage_date between
      (v_game_now::date - v_history_days)
      and
      (v_game_now::date + 1)
  ),
  metrics as (
    select
      c.*,
      a.last_status as automation_status,
      a.simulation_run_id,
      coalesce(a.attempt_count, 0) as attempt_count,
      a.last_error,
      a.details,
      sr.status as simulation_run_status,
      sr.engine_version,
      coalesce(
        nullif(a.details->>'calculation_due_game_at', '')::timestamptz,
        case
          when w.calculation_due_game_at is not null
            then w.calculation_due_game_at at time zone 'UTC'
          else c.stage_start_game_at - interval '3 hours'
        end
      ) as calculation_due_game_at,
      coalesce(
        nullif(a.details->>'official_results_reveal_game_at', '')::timestamptz,
        c.stage_start_game_at + interval '30 minutes'
      ) as results_due_game_at,
      nullif(a.details->>'calculated_at_real', '')::timestamptz
        as calculation_completed_at_real,
      coalesce((a.details->>'manifest_ready')::boolean, false)
        as replay_manifest_ready,
      nullif(a.details->>'replay_opened_game_at', '')::timestamptz
        as replay_opened_game_at,
      nullif(a.details->>'replay_opened_at_real', '')::timestamptz
        as replay_opened_at_real,
      nullif(a.details->>'replay_closes_at_real', '')::timestamptz
        as replay_closed_at_real,
      coalesce((a.details->>'results_published')::boolean, false)
        as results_published,
      coalesce((a.details->>'official_outputs_persisted')::boolean, false)
        as official_outputs_persisted,
      nullif(a.details->>'results_published_at_real', '')::timestamptz
        as results_published_at_real,
      nullif(a.details->>'survival_phase', '') as survival_phase,
      coalesce(res.result_rows, 0) as stage_result_rows,
      coalesce(cls.classification_rows, 0) as classification_rows,
      coalesce(rankings.ranking_award_rows, 0) as ranking_award_rows,
      coalesce(prizes.prize_award_rows, 0) as prize_award_rows,
      coalesce(prizes.paid_prize_award_rows, 0) as paid_prize_award_rows
    from candidates c
    left join public.race_stage_automation_state a
      on a.stage_id = c.stage_id
    left join public.race_engine_due_stage_watchdog_v1 w
      on w.stage_id = c.stage_id
    left join public.race_stage_simulation_runs sr
      on sr.id = a.simulation_run_id
    left join lateral (
      select count(*)::integer as result_rows
      from public.race_stage_results x
      where x.stage_id = c.stage_id
    ) res on true
    left join lateral (
      select count(*)::integer as classification_rows
      from public.race_classification_standings x
      where x.after_stage_id = c.stage_id
    ) cls on true
    left join lateral (
      select count(*)::integer as ranking_award_rows
      from public.race_ranking_point_awards x
      where x.stage_id = c.stage_id
    ) rankings on true
    left join lateral (
      select
        count(*)::integer as prize_award_rows,
        count(*) filter (where x.status = 'paid')::integer
          as paid_prize_award_rows
      from public.race_prize_awards x
      where x.stage_id = c.stage_id
    ) prizes on true
    where c.stage_start_game_at is not null
  ),
  derived as (
    select
      m.*,
      (m.stage_weather_cancelled or m.race_cancelled) as is_cancelled,
      (
        m.calculation_completed_at_real is not null
        or m.replay_manifest_ready
        or m.automation_status in (
          'calculated_hidden','replay_live','published','completed'
        )
        or m.stage_result_rows > 0
        or m.simulation_run_status = 'completed'
      ) as calculation_done,
      (
        m.replay_manifest_ready
        or m.automation_status in ('replay_live','published','completed')
        or m.results_published
      ) as replay_ready,
      (
        m.automation_status = 'published'
        and m.results_published
        and m.official_outputs_persisted
        and m.stage_result_rows > 0
        and m.classification_rows > 0
        and (
          not m.prizes_expected
          or (
            m.prize_award_rows > 0
            and m.paid_prize_award_rows = m.prize_award_rows
          )
        )
        and (
          not m.ranking_points_enabled
          or m.ranking_award_rows > 0
        )
      ) as completion_done
    from metrics m
  ),
  evaluated as (
    select
      d.*,
      case
        when d.is_cancelled then 'cancelled'
        when d.calculation_done then 'done'
        /* An active worker is progress, not an overdue failure. Evaluate this
         * before deadline/failed presentation so recovery and long-running
         * calculations are shown truthfully in Race Operations. */
        when d.automation_status = 'calculating'
          or d.simulation_run_status = 'running' then 'running'
        when d.automation_status = 'failed'
          or d.simulation_run_status = 'failed' then
          case
            when v_game_now < d.stage_start_game_at - interval '15 minutes'
              then 'running'
            else 'failed'
          end
        when v_game_now >= d.calculation_due_game_at
             + make_interval(mins => v_calc_grace) then 'overdue'
        else 'waiting'
      end as calculation_status,
      case
        when d.is_cancelled then 'cancelled'
        when d.replay_ready then 'ready'
        when not d.calculation_done then 'blocked'
        when v_game_now >= d.stage_start_game_at
             + make_interval(mins => v_replay_grace) then 'overdue'
        else 'waiting'
      end as replay_status,
      case
        when d.is_cancelled then 'cancelled'
        when d.completion_done then 'done'
        when not d.calculation_done or not d.replay_ready then 'blocked'
        when v_game_now >= d.results_due_game_at
             + make_interval(mins => v_completion_grace) then 'overdue'
        else 'waiting'
      end as completion_status
    from derived d
  ),
  final_rows as (
    select
      e.*,
      case
        when e.is_cancelled or e.completion_done then false
        when e.calculation_status in ('failed','overdue') then true
        when e.replay_status = 'overdue' then true
        when e.completion_status = 'overdue' then true
        else false
      end as has_problem,
      case
        when e.is_cancelled or e.completion_done then null
        when e.calculation_status = 'failed' then 'engine_failed'
        when e.calculation_status = 'overdue' then 'calculation_overdue'
        when e.replay_status = 'overdue' then 'replay_not_ready'
        when e.completion_status = 'overdue' then 'completion_incomplete'
        else null
      end as issue_key,
      case
        when e.is_cancelled or e.completion_done then null
        when e.calculation_status = 'failed' then 'critical'
        when e.calculation_status = 'overdue' then 'critical'
        when e.replay_status = 'overdue' then 'high'
        when e.completion_status = 'overdue' then 'high'
        else null
      end as issue_severity,
      case
        when e.is_cancelled or e.completion_done then null
        when e.calculation_status = 'failed'
          then coalesce(
            nullif(e.last_error, ''),
            'The production race-engine run exhausted its automatic recovery window.'
          )
        when e.calculation_status = 'overdue'
          then 'The stage calculation deadline passed without a completed calculation.'
        when e.replay_status = 'overdue'
          then 'The stage reached race time but the replay package is not ready.'
        when e.completion_status = 'overdue'
          then 'The replay/result window passed but official results or post-race processing are incomplete.'
        else null
      end as issue_message
    from evaluated e
  )
  insert into public.race_operations_stage_status_v1 (
    stage_id, race_id, race_name, race_category, stage_number, stage_name,
    stage_start_game_at, calculation_due_game_at, results_due_game_at,
    game_now_at_check, calculation_status, calculation_completed_at_real,
    calculation_run_id, calculation_attempt_count, replay_status,
    replay_manifest_ready, replay_opened_game_at, replay_opened_at_real,
    replay_closed_at_real, completion_status, results_published,
    official_outputs_persisted, stage_result_rows, classification_rows,
    ranking_award_rows, prize_award_rows, paid_prize_award_rows,
    results_published_at_real, automation_status, engine_version,
    survival_phase, last_error, is_cancelled, has_problem, issue_key,
    issue_severity, issue_message, first_problem_at, resolved_at,
    last_checked_at, updated_at
  )
  select
    f.stage_id, f.race_id, f.race_name, f.race_category, f.stage_number,
    f.stage_name, f.stage_start_game_at, f.calculation_due_game_at,
    f.results_due_game_at, v_game_now, f.calculation_status,
    f.calculation_completed_at_real, f.simulation_run_id, f.attempt_count,
    f.replay_status, f.replay_manifest_ready, f.replay_opened_game_at,
    f.replay_opened_at_real, f.replay_closed_at_real, f.completion_status,
    f.results_published, f.official_outputs_persisted, f.stage_result_rows,
    f.classification_rows, f.ranking_award_rows, f.prize_award_rows,
    f.paid_prize_award_rows, f.results_published_at_real,
    f.automation_status, f.engine_version, f.survival_phase, f.last_error,
    f.is_cancelled, f.has_problem, f.issue_key, f.issue_severity,
    f.issue_message, case when f.has_problem then now() else null end,
    null, now(), now()
  from final_rows f
  on conflict (stage_id) do update
  set
    race_id = excluded.race_id,
    race_name = excluded.race_name,
    race_category = excluded.race_category,
    stage_number = excluded.stage_number,
    stage_name = excluded.stage_name,
    stage_start_game_at = excluded.stage_start_game_at,
    calculation_due_game_at = excluded.calculation_due_game_at,
    results_due_game_at = excluded.results_due_game_at,
    game_now_at_check = excluded.game_now_at_check,
    calculation_status = excluded.calculation_status,
    calculation_completed_at_real = excluded.calculation_completed_at_real,
    calculation_run_id = excluded.calculation_run_id,
    calculation_attempt_count = excluded.calculation_attempt_count,
    replay_status = excluded.replay_status,
    replay_manifest_ready = excluded.replay_manifest_ready,
    replay_opened_game_at = excluded.replay_opened_game_at,
    replay_opened_at_real = excluded.replay_opened_at_real,
    replay_closed_at_real = excluded.replay_closed_at_real,
    completion_status = excluded.completion_status,
    results_published = excluded.results_published,
    official_outputs_persisted = excluded.official_outputs_persisted,
    stage_result_rows = excluded.stage_result_rows,
    classification_rows = excluded.classification_rows,
    ranking_award_rows = excluded.ranking_award_rows,
    prize_award_rows = excluded.prize_award_rows,
    paid_prize_award_rows = excluded.paid_prize_award_rows,
    results_published_at_real = excluded.results_published_at_real,
    automation_status = excluded.automation_status,
    engine_version = excluded.engine_version,
    survival_phase = excluded.survival_phase,
    last_error = excluded.last_error,
    is_cancelled = excluded.is_cancelled,
    has_problem = excluded.has_problem,
    issue_key = excluded.issue_key,
    issue_severity = excluded.issue_severity,
    issue_message = excluded.issue_message,
    first_problem_at = case
      when excluded.has_problem then
        case
          when public.race_operations_stage_status_v1.has_problem
               and public.race_operations_stage_status_v1.issue_key
                   is not distinct from excluded.issue_key
          then coalesce(
            public.race_operations_stage_status_v1.first_problem_at,
            excluded.first_problem_at
          )
          else excluded.first_problem_at
        end
      else null
    end,
    resolved_at = case
      when excluded.has_problem then null
      when public.race_operations_stage_status_v1.has_problem then now()
      else public.race_operations_stage_status_v1.resolved_at
    end,
    last_checked_at = now(),
    updated_at = now();

  update public.race_operations_incidents_v1 i
  set
    resolved_at = now(),
    resolution_message = 'The monitor no longer detects this problem.',
    last_seen_at = now(),
    updated_at = now()
  where i.resolved_at is null
    and exists (
      select 1
      from public.race_operations_stage_status_v1 s
      where s.stage_id = i.stage_id
        and (
          not s.has_problem
          or s.issue_key is distinct from i.issue_key
        )
    );

  insert into public.race_operations_incidents_v1 (
    stage_id, race_id, race_name, stage_number, issue_key, severity,
    message, stage_start_game_at, detected_game_at, detected_at,
    last_seen_at, metadata
  )
  select
    s.stage_id, s.race_id, s.race_name, s.stage_number, s.issue_key,
    s.issue_severity, s.issue_message, s.stage_start_game_at,
    s.game_now_at_check, now(), now(),
    jsonb_build_object(
      'calculation_status', s.calculation_status,
      'replay_status', s.replay_status,
      'completion_status', s.completion_status,
      'automation_status', s.automation_status,
      'engine_version', s.engine_version,
      'survival_phase', s.survival_phase,
      'last_error', s.last_error,
      'calculation_due_game_at', s.calculation_due_game_at,
      'results_due_game_at', s.results_due_game_at
    )
  from public.race_operations_stage_status_v1 s
  where s.has_problem
    and s.issue_key is not null
    and not exists (
      select 1
      from public.race_operations_incidents_v1 i
      where i.stage_id = s.stage_id
        and i.issue_key = s.issue_key
        and i.resolved_at is null
    );

  update public.race_operations_incidents_v1 i
  set
    last_seen_at = now(),
    message = s.issue_message,
    severity = s.issue_severity,
    updated_at = now()
  from public.race_operations_stage_status_v1 s
  where i.stage_id = s.stage_id
    and i.issue_key = s.issue_key
    and i.resolved_at is null
    and s.has_problem;

  delete from public.race_operations_stage_status_v1 s
  where s.stage_start_game_at < v_game_now - make_interval(days => v_history_days)
    and not s.has_problem;

  delete from public.race_operations_incidents_v1 i
  where i.resolved_at is not null
    and i.stage_start_game_at < v_game_now - make_interval(days => v_history_days);

  select count(*)::integer into v_problem_count
  from public.race_operations_stage_status_v1
  where has_problem;

  select count(*)::integer into v_row_count
  from public.race_operations_stage_status_v1;

  return jsonb_build_object(
    'ok', true,
    'game_now', v_game_now,
    'rows', v_row_count,
    'problems', v_problem_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_race_operations_problem_count_v1()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select count(*)::integer into v_count
  from public.race_operations_stage_status_v1
  where has_problem;

  return coalesce(v_count, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_race_operations_v1(p_view text DEFAULT 'today'::text, p_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_game_now timestamptz;
  v_view text := lower(trim(coalesce(p_view, 'today')));
  v_days integer := greatest(1, least(coalesce(p_days, 7), 30));
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if v_view not in ('today','problems','history') then
    raise exception 'Invalid race operations view'
      using errcode = '22023';
  end if;

  v_game_now := public.get_current_game_timestamp();

  select jsonb_build_object(
    'game_now', v_game_now,
    'alert_email', (
      select alert_email from public.race_operations_config_v1 where id = true
    ),
    'email_enabled', (
      select email_enabled from public.race_operations_config_v1 where id = true
    ),
    'counts', jsonb_build_object(
      'today_total', count(*) filter (
        where s.stage_start_game_at::date = v_game_now::date
      )::integer,
      'today_problems', count(*) filter (
        where s.stage_start_game_at::date = v_game_now::date
          and s.has_problem
      )::integer,
      'active_problems', count(*) filter (
        where s.has_problem
      )::integer,
      'completed_today', count(*) filter (
        where s.stage_start_game_at::date = v_game_now::date
          and s.completion_status = 'done'
      )::integer
    ),
    'rows', coalesce(
      (
        select jsonb_agg(
          to_jsonb(row_data)
          order by row_data.stage_start_game_at desc
        )
        from (
          select
            s.*,
            i.id as incident_id,
            i.detected_at as incident_detected_at,
            i.email_sent_at as incident_email_sent_at,
            i.email_attempt_count as incident_email_attempt_count,
            i.email_last_error as incident_email_last_error
          from public.race_operations_stage_status_v1 s
          left join lateral (
            select ii.*
            from public.race_operations_incidents_v1 ii
            where ii.stage_id = s.stage_id
              and ii.resolved_at is null
            order by ii.detected_at desc
            limit 1
          ) i on true
          where
            (
              v_view = 'today'
              and s.stage_start_game_at::date = v_game_now::date
            )
            or (
              v_view = 'problems'
              and s.has_problem
            )
            or (
              v_view = 'history'
              and s.stage_start_game_at >= v_game_now - make_interval(days => v_days)
              and s.stage_start_game_at <= v_game_now + interval '1 day'
            )
          order by s.stage_start_game_at desc
        ) row_data
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.race_operations_stage_status_v1 s;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_refresh_race_operations_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  return public.race_operations_refresh_v1();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_race_stage_terrain_split_v1(p_split jsonb, p_terrain_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_flat numeric := greatest(0, coalesce(nullif(p_split->>'flat','')::numeric, 0));
  v_hilly numeric := greatest(0, coalesce(nullif(p_split->>'hilly','')::numeric, 0));
  v_mountain numeric := greatest(0, coalesce(nullif(p_split->>'mountain','')::numeric, 0));
  v_cobbled numeric := greatest(0, coalesce(nullif(p_split->>'cobbled','')::numeric, 0));
  v_total numeric;
  n_flat numeric;
  n_hilly numeric;
  n_mountain numeric;
  n_cobbled numeric;
begin
  v_total := v_flat + v_hilly + v_mountain + v_cobbled;

  if v_total <= 0 then
    v_flat := case when p_terrain_type='flat' then 100 else 0 end;
    v_hilly := case when p_terrain_type='hilly' then 100 else 0 end;
    v_mountain := case when p_terrain_type='mountain' then 100 else 0 end;
    v_cobbled := case when p_terrain_type='cobbled' then 100 else 0 end;
    v_total := 100;
  end if;

  n_hilly := round((v_hilly / v_total) * 100, 6);
  n_mountain := round((v_mountain / v_total) * 100, 6);
  n_cobbled := round((v_cobbled / v_total) * 100, 6);
  n_flat := round(100 - n_hilly - n_mountain - n_cobbled, 6);

  return jsonb_build_object(
    'flat', n_flat,
    'hilly', n_hilly,
    'mountain', n_mountain,
    'cobbled', n_cobbled
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_race_stage_profile_metadata_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_summit_finish boolean := false;
  v_split jsonb;
  v_terrain_type text;
begin
  v_terrain_type := case
    when new.terrain_type is null then null
    else lower(trim(new.terrain_type))
  end;

  v_split := public.normalize_race_stage_terrain_split_v1(
    new.terrain_split,
    v_terrain_type
  );

  v_summit_finish :=
    coalesce(v_terrain_type, '') = 'mountain'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(new.mountain_climbs, '[]'::jsonb)) climb
      where abs(
        coalesce(nullif(climb->>'km','')::numeric, -999999)
        - coalesce(new.distance_km, 0)
      ) <= 0.25
      and upper(
        regexp_replace(
          coalesce(climb->>'category', climb->>'kom_category', ''),
          '^CAT(EGORY)?[[:space:]]*',
          '',
          'i'
        )
      ) in ('HC','1','2')
    );

  update public.race_stages stage
  set
    terrain_type = coalesce(v_terrain_type, stage.terrain_type),
    profile_type = coalesce(new.profile_type, stage.profile_type),
    flat_pct = (v_split->>'flat')::numeric,
    hilly_pct = (v_split->>'hilly')::numeric,
    mountain_pct = (v_split->>'mountain')::numeric,
    cobbled_pct = (v_split->>'cobbled')::numeric,
    elevation_gain_m = coalesce(new.elevation_gain_m, stage.elevation_gain_m),
    finish_type = case when v_summit_finish then 'summit_finish' else stage.finish_type end,
    is_summit_finish = case when v_summit_finish then true else stage.is_summit_finish end,
    updated_at = clock_timestamp()
  where stage.id = new.stage_id
    and not exists (
      select 1
      from public.race_stage_authoritative_runs authority
      where authority.stage_id = stage.id
    );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_assert_manager_access_v1(p_club_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode='28000';
  end if;

  if p_club_id is null then
    raise exception 'Club id is required.' using errcode='22023';
  end if;

  if not finance.is_club_member_or_owner(p_club_id, auth.uid()) then
    raise exception 'Not allowed.' using errcode='42501';
  end if;

  if not public.current_user_has_premium_v1() then
    raise exception 'Premium membership is required.' using errcode='42501';
  end if;

  return p_club_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_get_command_center_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
  v_game_ts timestamptz;
  v_game_date date;
  v_balance bigint := 0;
  v_weekly_income bigint := 0;
  v_weekly_expenses bigint := 0;
  v_wage_total bigint := 0;
  v_staff_wages bigint := 0;
  v_sponsor_monthly bigint := 0;
  v_policy_30d bigint := 0;
begin
  v_club_id := public.premium_assert_manager_access_v1(p_club_id);
  v_game_ts := public.get_current_game_timestamp();
  v_game_date := v_game_ts::date;

  select
    coalesce(current_balance,0),
    coalesce(weekly_income,0),
    coalesce(weekly_expenses,0),
    coalesce(wage_total,0)
  into
    v_balance,
    v_weekly_income,
    v_weekly_expenses,
    v_wage_total
  from public.club_finance_summary
  where club_id = v_club_id;

  select coalesce(sum(cs.salary_weekly),0)::bigint
  into v_staff_wages
  from public.club_staff cs
  where cs.club_id=v_club_id and cs.is_active=true;

  select coalesce(sum(cs.monthly_amount),0)::bigint
  into v_sponsor_monthly
  from public.club_sponsors cs
  where cs.club_id=v_club_id and cs.status='active';

  begin
    select coalesce(total_policy_cost,0)
    into v_policy_30d
    from public.finance_get_team_policy_cost_summary(
      v_club_id,
      v_game_date - 30,
      v_game_date
    )
    limit 1;
  exception when others then
    v_policy_30d := 0;
  end;

  return jsonb_build_object(
    'scope_note',
      'Premium Command Center is a deterministic management workspace built from information the manager already owns. It does not replace Staff Briefing Centre, does not create role-specific advisor reports, and is not influenced by staff advisory skill.',
    'game_now', v_game_ts,
    'club', (
      select jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'cash_balance', v_balance
      )
      from public.clubs c
      where c.id=v_club_id
    ),
    'summary', jsonb_build_object(
      'weekly_income', v_weekly_income,
      'weekly_expenses', v_weekly_expenses,
      'weekly_net', v_weekly_income-v_weekly_expenses,
      'rider_wages_weekly', v_wage_total,
      'staff_wages_weekly', v_staff_wages,
      'active_sponsor_monthly_income', v_sponsor_monthly,
      'policy_cost_last_30_game_days', v_policy_30d,
      'upcoming_races_60d', (
        select count(*)::integer
        from public.race_preparations rp
        join public.races r on r.id=rp.race_id
        where rp.club_id=v_club_id
          and r.start_date between v_game_date and v_game_date+60
          and lower(coalesce(rp.status,'')) not in ('withdrawn','cancelled','canceled')
      ),
      'unread_transfer_alerts', (
        select count(*)::integer
        from public.transfer_market_alerts a
        where a.club_id=v_club_id and not a.is_read
      ),
      'shortlist_count', (
        select count(*)::integer
        from public.transfer_shortlist s
        where s.club_id=v_club_id
          and s.target_type='rider'
          and s.removed_at is null
      ),
      'active_sponsor_objectives', (
        select count(*)::integer
        from public.club_sponsor_objectives o
        join public.club_sponsors cs on cs.id=o.club_sponsor_id
        where cs.club_id=v_club_id
          and lower(coalesce(o.status,'')) not in ('completed','failed','cancelled','canceled','paid')
      )
    ),
    'season_planner', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.start_date, x.race_name)
      from (
        select
          rp.id as race_preparation_id,
          r.id as race_id,
          r.name as race_name,
          r.category,
          r.race_type,
          r.start_date,
          r.end_date,
          rp.status as preparation_status,
          rp.startlist_status,
          rp.rider_submission_deadline_on,
          rp.setup_window_opens_on,
          coalesce(stage_count.total_stages,0) as total_stages,
          coalesce(plan_count.saved_stage_plans,0) as saved_stage_plans,
          coalesce(obj_count.sponsor_target_count,0) as sponsor_target_count,
          case
            when rp.rider_submission_deadline_on is not null
                 and rp.rider_submission_deadline_on <= v_game_date + 2
                 and coalesce(rp.startlist_status,'') not in ('submitted','locked')
              then 'deadline_close'
            when coalesce(plan_count.saved_stage_plans,0) < coalesce(stage_count.total_stages,0)
              then 'planning_incomplete'
            else 'on_track'
          end as planning_state
        from public.race_preparations rp
        join public.races r on r.id=rp.race_id
        left join lateral (
          select count(*)::integer as total_stages
          from public.race_stages st
          where st.race_id=r.id
        ) stage_count on true
        left join lateral (
          select count(*) filter (where sp.last_saved_at is not null or sp.submitted_at is not null)::integer
            as saved_stage_plans
          from public.race_stage_plans sp
          where sp.race_preparation_id=rp.id
        ) plan_count on true
        left join lateral (
          select count(*)::integer as sponsor_target_count
          from public.club_sponsor_objectives o
          join public.club_sponsors cs on cs.id=o.club_sponsor_id
          where cs.club_id=v_club_id
            and o.target_race_id=r.id
            and lower(coalesce(o.status,'')) not in ('failed','cancelled','canceled')
        ) obj_count on true
        where rp.club_id=v_club_id
          and r.start_date between v_game_date and v_game_date+60
          and lower(coalesce(rp.status,'')) not in ('withdrawn','cancelled','canceled')
        order by r.start_date, r.name
        limit 30
      ) x
    ), '[]'::jsonb),
    'transfer_command', jsonb_build_object(
      'shortlist', coalesce((
        select jsonb_agg(to_jsonb(s) order by s.added_at desc)
        from public.transfer_list_rider_shortlist_v2(v_club_id) s
      ), '[]'::jsonb),
      'saved_searches', coalesce((
        select jsonb_agg(to_jsonb(s) order by s.updated_at desc)
        from public.transfer_list_saved_searches_v1(v_club_id) s
      ), '[]'::jsonb),
      'alerts', coalesce((
        select jsonb_agg(to_jsonb(a) order by a.created_at desc)
        from public.transfer_list_market_alerts_v1(v_club_id,20) a
      ), '[]'::jsonb),
      'pipeline', jsonb_build_object(
        'open_transfer_offers', (
          select count(*)::integer
          from public.rider_transfer_offers o
          where o.buyer_club_id=v_club_id
            and o.status in ('open','club_accepted')
        ),
        'open_transfer_negotiations', (
          select count(*)::integer
          from public.rider_transfer_negotiations n
          where n.buyer_club_id=v_club_id
            and n.status in ('draft','open','pending','countered','club_accepted')
        ),
        'open_free_agent_negotiations', (
          select count(*)::integer
          from public.rider_free_agent_negotiations n
          where n.club_id=v_club_id
            and n.status in ('draft','open','pending','countered')
        )
      )
    ),
    'finance', jsonb_build_object(
      'balance', v_balance,
      'weekly_income', v_weekly_income,
      'weekly_expenses', v_weekly_expenses,
      'weekly_net', v_weekly_income-v_weekly_expenses,
      'rider_wages_weekly', v_wage_total,
      'staff_wages_weekly', v_staff_wages,
      'active_sponsor_monthly_income', v_sponsor_monthly,
      'policy_cost_last_30_game_days', v_policy_30d,
      'cashflow', coalesce((
        select jsonb_agg(to_jsonb(cf) order by cf.bucket_date)
        from public.finance_get_club_cashflow_series(v_club_id,30) cf
      ), '[]'::jsonb)
    ),
    'sponsor_intelligence', coalesce((
      select jsonb_agg(
        to_jsonb(s) ||
        jsonb_build_object(
          'remaining_value', greatest(0,coalesce(s.target_value,0)-coalesce(s.current_value,0)),
          'progress_pct', case
            when coalesce(s.target_value,0) <= 0 then 0
            else least(100,round(100.0*coalesce(s.current_value,0)/s.target_value))
          end,
          'risk_band', case
            when lower(coalesce(s.objective_result_state,s.objective_status,'')) in ('completed','success','paid') then 'completed'
            when lower(coalesce(s.objective_result_state,s.objective_status,'')) in ('failed','failure') then 'failed'
            when coalesce(s.current_value,0) >= coalesce(s.target_value,0) and coalesce(s.target_value,0)>0 then 'target_met'
            when coalesce(s.target_check_game_date,s.eligible_to_game_date) is not null
                 and coalesce(s.target_check_game_date,s.eligible_to_game_date) <= v_game_date+7 then 'high'
            when coalesce(s.target_check_game_date,s.eligible_to_game_date) is not null
                 and coalesce(s.target_check_game_date,s.eligible_to_game_date) <= v_game_date+14 then 'medium'
            else 'normal'
          end
        )
        order by
          coalesce(s.target_check_game_date,s.eligible_to_game_date,'9999-12-31'::date),
          s.objective_title
      )
      from public.get_club_sponsor_objectives_ui_v1(v_club_id) s
    ), '[]'::jsonb),
    'rider_development', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.development_8w desc, x.display_name)
      from (
        select
          r.id as rider_id,
          coalesce(nullif(btrim(concat_ws(' ',r.first_name,r.last_name)),''),r.display_name,r.id::text) as display_name,
          r.country_code,
          r.role,
          r.birth_date,
          r.overall,
          r.potential,
          r.fatigue,
          r.morale,
          r.availability_status,
          latest.week_start_date,
          latest.week_end_date,
          latest.total_net_change as latest_net_change,
          latest.overall_delta as latest_overall_delta,
          latest.ui_state,
          latest.ui_label,
          coalesce(dev.development_8w,0) as development_8w,
          coalesce(dev.overall_delta_8w,0) as overall_delta_8w,
          coalesce(dev.weeks_recorded,0) as weeks_recorded
        from public.club_riders cr
        join public.riders r on r.id=cr.rider_id
        left join public.rider_latest_weekly_development_v latest on latest.rider_id=r.id
        left join lateral (
          select
            coalesce(sum(s.total_net_change),0)::numeric as development_8w,
            coalesce(sum(s.overall_delta),0)::numeric as overall_delta_8w,
            count(*)::integer as weeks_recorded
          from public.rider_weekly_development_summaries s
          where s.rider_id=r.id
            and s.week_end_date >= v_game_date-56
        ) dev on true
        where cr.club_id=v_club_id
      ) x
    ), '[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_get_race_strategy_lab_v1(p_race_preparation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
  v_race_id uuid;
begin
  select rp.club_id, rp.race_id
  into v_club_id, v_race_id
  from public.race_preparations rp
  where rp.id=p_race_preparation_id;

  if v_club_id is null then
    raise exception 'Race preparation not found.' using errcode='P0002';
  end if;

  perform public.premium_assert_manager_access_v1(v_club_id);

  return jsonb_build_object(
    'scope_note',
      'Strategy Lab is an on-demand scenario comparison using visible rider, fatigue and race-profile data. It is separate from the coin-based Sports Director advisory and does not create advisor recommendations or change the race engine.',
    'race', (
      select jsonb_build_object(
        'race_preparation_id', rp.id,
        'race_id', r.id,
        'race_name', r.name,
        'category', r.category,
        'race_type', r.race_type,
        'start_date', r.start_date,
        'end_date', r.end_date,
        'preparation_status', rp.status,
        'startlist_status', rp.startlist_status
      )
      from public.race_preparations rp
      join public.races r on r.id=rp.race_id
      where rp.id=p_race_preparation_id
    ),
    'stages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'stage_id', st.id,
          'stage_number', st.stage_number,
          'stage_name', st.name,
          'stage_date', st.stage_date,
          'terrain_type', st.terrain_type,
          'profile_type', st.profile_type,
          'stage_format', st.stage_format,
          'distance_km', st.distance_km,
          'elevation_gain_m', st.elevation_gain_m,
          'current_plan', case when sp.id is null then null else jsonb_build_object(
            'stage_plan_id', sp.id,
            'status', sp.status,
            'stage_objective', sp.stage_objective,
            'team_strategy', sp.team_strategy,
            'risk_level', sp.risk_level,
            'last_saved_at', sp.last_saved_at
          ) end,
          'top_candidates', coalesce((
            select jsonb_agg(to_jsonb(cand) order by cand.suitability_score desc, cand.display_name)
            from (
              select
                r.id as rider_id,
                coalesce(nullif(btrim(concat_ws(' ',r.first_name,r.last_name)),''),r.display_name,r.id::text) as display_name,
                r.country_code,
                r.role,
                r.overall,
                r.potential,
                r.fatigue,
                r.morale,
                exists (
                  select 1
                  from public.race_stage_plan_riders spr
                  where spr.race_stage_plan_id=sp.id
                    and spr.rider_id=r.id
                ) as currently_selected,
                greatest(0,least(100,round(
                  case
                    when lower(coalesce(st.stage_format,'')) in ('itt','tt','time_trial','individual_time_trial')
                      or lower(coalesce(st.terrain_type,'')) like '%time%'
                      then (
                        coalesce(r.time_trial,50)*0.40 +
                        coalesce(r.endurance,50)*0.20 +
                        coalesce(r.flat,50)*0.15 +
                        coalesce(r.race_iq,50)*0.15 +
                        coalesce(r.recovery,50)*0.10
                      )
                    when lower(coalesce(st.terrain_type,st.profile_type,'')) like '%mountain%'
                      then (
                        coalesce(r.climbing,50)*0.35 +
                        coalesce(r.endurance,50)*0.20 +
                        coalesce(r.recovery,50)*0.15 +
                        coalesce(r.resistance,50)*0.10 +
                        coalesce(r.race_iq,50)*0.10 +
                        coalesce(r.teamwork,50)*0.10
                      )
                    when lower(coalesce(st.terrain_type,st.profile_type,'')) like '%hill%'
                      then (
                        coalesce(r.climbing,50)*0.25 +
                        coalesce(r.flat,50)*0.15 +
                        coalesce(r.endurance,50)*0.20 +
                        coalesce(r.recovery,50)*0.10 +
                        coalesce(r.resistance,50)*0.10 +
                        coalesce(r.race_iq,50)*0.10 +
                        coalesce(r.teamwork,50)*0.10
                      )
                    when lower(coalesce(st.terrain_type,st.profile_type,'')) like '%cobbl%'
                      then (
                        coalesce(r.flat,50)*0.20 +
                        coalesce(r.resistance,50)*0.20 +
                        coalesce(r.endurance,50)*0.20 +
                        coalesce(r.race_iq,50)*0.15 +
                        coalesce(r.teamwork,50)*0.10 +
                        coalesce(r.sprint,50)*0.10 +
                        coalesce(r.recovery,50)*0.05
                      )
                    else (
                      coalesce(r.flat,50)*0.25 +
                      coalesce(r.sprint,50)*0.25 +
                      coalesce(r.endurance,50)*0.20 +
                      coalesce(r.race_iq,50)*0.15 +
                      coalesce(r.teamwork,50)*0.10 +
                      coalesce(r.recovery,50)*0.05
                    )
                  end
                  - coalesce(r.fatigue,0)*0.25
                  + (coalesce(r.morale,50)-50)*0.08
                )))::integer as suitability_score
              from public.club_riders cr
              join public.riders r on r.id=cr.rider_id
              where cr.club_id=v_club_id
                and coalesce(r.availability_status,'fit') <> 'injured'
              order by suitability_score desc, display_name
              limit 8
            ) cand
          ), '[]'::jsonb)
        )
        order by st.stage_number
      )
      from public.race_stages st
      left join public.race_stage_plans sp
        on sp.race_preparation_id=p_race_preparation_id
       and sp.stage_id=st.id
      where st.race_id=v_race_id
    ), '[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_list_templates_v1(p_club_id uuid, p_template_type text DEFAULT NULL::text)
 RETURNS SETOF premium_manager_templates_v1
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  return query
  select t.*
  from public.premium_manager_templates_v1 t
  where t.club_id=p_club_id
    and t.user_id=auth.uid()
    and (p_template_type is null or t.template_type=p_template_type)
  order by t.template_type, t.is_default desc, t.updated_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_save_template_v1(p_club_id uuid, p_template_id uuid, p_template_type text, p_name text, p_payload_json jsonb, p_is_default boolean DEFAULT false)
 RETURNS premium_manager_templates_v1
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_row public.premium_manager_templates_v1;
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  if p_template_type not in ('race_strategy','training','equipment','financial_scenario','season_plan') then
    raise exception 'Unsupported template type.' using errcode='22023';
  end if;

  if nullif(btrim(p_name),'') is null then
    raise exception 'Template name is required.' using errcode='22023';
  end if;

  if coalesce(p_is_default,false) then
    update public.premium_manager_templates_v1
    set is_default=false, updated_at=now()
    where club_id=p_club_id
      and user_id=auth.uid()
      and template_type=p_template_type;
  end if;

  if p_template_id is null then
    insert into public.premium_manager_templates_v1(
      club_id,user_id,template_type,name,payload_json,is_default
    )
    values(
      p_club_id,auth.uid(),p_template_type,btrim(p_name),
      coalesce(p_payload_json,'{}'::jsonb),coalesce(p_is_default,false)
    )
    returning id into v_id;
  else
    update public.premium_manager_templates_v1
    set
      template_type=p_template_type,
      name=btrim(p_name),
      payload_json=coalesce(p_payload_json,'{}'::jsonb),
      is_default=coalesce(p_is_default,false),
      updated_at=now()
    where id=p_template_id
      and club_id=p_club_id
      and user_id=auth.uid()
    returning id into v_id;

    if v_id is null then
      raise exception 'Template not found.' using errcode='P0002';
    end if;
  end if;

  select * into v_row
  from public.premium_manager_templates_v1
  where id=v_id;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_delete_template_v1(p_club_id uuid, p_template_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_count integer;
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  delete from public.premium_manager_templates_v1
  where id=p_template_id
    and club_id=p_club_id
    and user_id=auth.uid();

  get diagnostics v_count=row_count;
  return v_count>0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_list_automation_rules_v1(p_club_id uuid)
 RETURNS TABLE(id uuid, club_id uuid, user_id uuid, rule_type text, name text, template_id uuid, template_name text, template_type text, match_json jsonb, is_enabled boolean, last_matched_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  return query
  select
    r.id,r.club_id,r.user_id,r.rule_type,r.name,r.template_id,
    t.name,t.template_type,r.match_json,r.is_enabled,r.last_matched_at,
    r.created_at,r.updated_at
  from public.premium_manager_automation_rules_v1 r
  join public.premium_manager_templates_v1 t on t.id=r.template_id
  where r.club_id=p_club_id
    and r.user_id=auth.uid()
  order by r.is_enabled desc,r.updated_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_save_automation_rule_v1(p_club_id uuid, p_rule_id uuid, p_rule_type text, p_name text, p_template_id uuid, p_match_json jsonb, p_is_enabled boolean DEFAULT true)
 RETURNS premium_manager_automation_rules_v1
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_template_type text;
  v_row public.premium_manager_automation_rules_v1;
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  if p_rule_type not in ('strategy_prefill','training_prefill') then
    raise exception 'Unsupported automation rule type.' using errcode='22023';
  end if;

  select t.template_type
  into v_template_type
  from public.premium_manager_templates_v1 t
  where t.id=p_template_id
    and t.club_id=p_club_id
    and t.user_id=auth.uid();

  if v_template_type is null then
    raise exception 'Template not found.' using errcode='P0002';
  end if;

  if (p_rule_type='strategy_prefill' and v_template_type<>'race_strategy')
     or (p_rule_type='training_prefill' and v_template_type<>'training')
      then
    raise exception 'Automation rule and template type do not match.' using errcode='22023';
  end if;

  if p_rule_id is null then
    insert into public.premium_manager_automation_rules_v1(
      club_id,user_id,rule_type,name,template_id,match_json,is_enabled
    )
    values(
      p_club_id,auth.uid(),p_rule_type,btrim(p_name),p_template_id,
      coalesce(p_match_json,'{}'::jsonb),coalesce(p_is_enabled,true)
    )
    returning id into v_id;
  else
    update public.premium_manager_automation_rules_v1
    set
      rule_type=p_rule_type,
      name=btrim(p_name),
      template_id=p_template_id,
      match_json=coalesce(p_match_json,'{}'::jsonb),
      is_enabled=coalesce(p_is_enabled,true),
      updated_at=now()
    where id=p_rule_id
      and club_id=p_club_id
      and user_id=auth.uid()
    returning id into v_id;

    if v_id is null then
      raise exception 'Automation rule not found.' using errcode='P0002';
    end if;
  end if;

  select * into v_row
  from public.premium_manager_automation_rules_v1
  where id=v_id;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_delete_automation_rule_v1(p_club_id uuid, p_rule_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_count integer;
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  delete from public.premium_manager_automation_rules_v1
  where id=p_rule_id
    and club_id=p_club_id
    and user_id=auth.uid();

  get diagnostics v_count=row_count;
  return v_count>0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_match_automation_template_v1(p_club_id uuid, p_rule_type text, p_context jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_rule record;
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  select
    r.*,
    t.name as template_name,
    t.template_type,
    t.payload_json
  into v_rule
  from public.premium_manager_automation_rules_v1 r
  join public.premium_manager_templates_v1 t on t.id=r.template_id
  where r.club_id=p_club_id
    and r.user_id=auth.uid()
    and r.rule_type=p_rule_type
    and r.is_enabled
    and not exists (
      select 1
      from jsonb_each_text(coalesce(r.match_json,'{}'::jsonb)) m
      where coalesce(p_context->>m.key,'') <> m.value
    )
  order by jsonb_object_length(coalesce(r.match_json,'{}'::jsonb)) desc,
           r.updated_at desc
  limit 1;

  if v_rule.id is null then
    return jsonb_build_object('matched',false);
  end if;

  update public.premium_manager_automation_rules_v1
  set last_matched_at=now()
  where id=v_rule.id;

  return jsonb_build_object(
    'matched',true,
    'rule_id',v_rule.id,
    'rule_name',v_rule.name,
    'template_id',v_rule.template_id,
    'template_name',v_rule.template_name,
    'template_type',v_rule.template_type,
    'payload_json',v_rule.payload_json,
    'match_json',v_rule.match_json
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_squad_season_dashboard_v1(p_club_id uuid, p_season_year integer DEFAULT 2000)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_payload jsonb;
  v_is_premium boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  if p_club_id is null then
    raise exception 'Club id is required.' using errcode = '22023';
  end if;

  if not finance.is_club_member_or_owner(p_club_id, auth.uid()) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  v_payload := public._get_club_squad_season_dashboard_v1_internal(
    p_club_id,
    p_season_year
  );

  select coalesce(status.is_premium, false)
  into v_is_premium
  from public.get_my_premium_status() status
  limit 1;

  if v_is_premium then
    return v_payload;
  end if;

  return jsonb_build_object(
    'seasonTrend', '[]'::jsonb,
    'podiumChart', '[]'::jsonb,
    'summary', jsonb_build_object(
      'wins', 0,
      'podiums', 0,
      'top10s', 0,
      'bestGC', 0
    ),
    'lastTeamRace', coalesce(v_payload -> 'lastTeamRace', '{}'::jsonb),
    'nextRaceSelection', coalesce(v_payload -> 'nextRaceSelection', '{}'::jsonb),
    'raceTypeSnapshot', '[]'::jsonb
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_calculation_guard_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_game_now timestamp without time zone := public.get_current_game_timestamp()::timestamp without time zone;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_stage record;
  v_latest record;
  v_checked integer := 0;
  v_healthy integer := 0;
  v_recovery_needed integer := 0;
  v_runner_kicks integer := 0;
  v_pass1_kicks integer := 0;
  v_pass2_kicks integer := 0;
  v_survival jsonb := '{}'::jsonb;
  v_secret text;
begin
  if not pg_try_advisory_xact_lock(hashtext('universal_race_calculation_guard_v1')::bigint) then
    return jsonb_build_object('status','already_running');
  end if;

  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id = true;

  if not found or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled');
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='universal_race_worker_secret_v1'
  limit 1;

  begin
    perform public.race_engine_due_stage_watchdog_run_v1();
  exception when others then
    null;
  end;

  begin
    v_survival := public.universal_race_stage_survival_recover_v1();
  exception when others then
    v_survival := jsonb_build_object('status','error','message',sqlerrm);
  end;

  for v_stage in
    select
      s.id as stage_id,
      s.race_id,
      r.name as race_name,
      s.stage_number,
      public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone as stage_start_game_at,
      public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone
        - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3)) as calculation_due_game_at
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where coalesce(s.stage_format,'road_race')='road_race'
      and not coalesce(s.weather_cancelled,false)
      and public.race_stage_planned_start_game_at_v1(s.id) is not null
      and public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone
            >= v_control.typescript_activation_game_at
      and public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone
            - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3))
            + interval '15 minutes' <= v_game_now
      and public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone
            + interval '30 minutes' >= v_game_now
      and not exists (
        select 1 from public.race_stage_authoritative_runs a
        where a.stage_id=s.id
      )
    order by calculation_due_game_at, s.id
    limit 100
  loop
    v_checked := v_checked + 1;

    select sr.id, sr.status, sr.updated_at, sr.started_at, sr.created_at,
           coalesce(sr.result_summary_json->>'calculation_contract','') as calculation_contract,
           coalesce(sr.result_summary_json->>'survival_phase','') as survival_phase,
           coalesce(sr.result_summary_json->>'pass2_scenario_mode','') as pass2_scenario_mode
    into v_latest
    from public.race_stage_simulation_runs sr
    where sr.stage_id=v_stage.stage_id
    order by sr.created_at desc, sr.id
    limit 1;

    if exists (
      select 1
      from public.race_stage_automation_state a
      where a.stage_id=v_stage.stage_id
        and (
          a.last_status in ('calculated_hidden','replay_live','published','completed')
          or coalesce((a.details->>'manifest_ready')::boolean,false)
        )
    ) then
      v_healthy := v_healthy + 1;
      continue;
    end if;

    v_recovery_needed := v_recovery_needed + 1;

    perform net.http_post(
      url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-runner',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-universal-race-worker-secret',v_secret
      ),
      body := '{"action":"tick"}'::jsonb,
      timeout_milliseconds := 30000
    );
    v_runner_kicks := v_runner_kicks + 1;

    if v_latest.id is not null and (
      v_latest.status='failed'
      or v_latest.survival_phase in (
        'pass1_pending','pass1_resume_claimed','pass1_payload_loading',
        'pass1_started','pass1_resume_failed','pass1_ready_no_scenario'
      )
    ) then
      perform net.http_post(
        url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-pass1-resume',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-universal-race-worker-secret',v_secret
        ),
        body := '{"action":"tick"}'::jsonb,
        timeout_milliseconds := 30000
      );
      v_pass1_kicks := v_pass1_kicks + 1;
    end if;

    if v_latest.id is not null then
      perform net.http_post(
        url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-pass2-resume',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-universal-race-worker-secret',v_secret
        ),
        body := '{"action":"tick"}'::jsonb,
        timeout_milliseconds := 30000
      );
      v_pass2_kicks := v_pass2_kicks + 1;

      insert into public.race_engine_calculation_survival_audit_v1(
        stage_id,race_id,simulation_run_id,action,reason,details
      )
      values (
        v_stage.stage_id,
        v_stage.race_id,
        v_latest.id,
        'deadline_guard_recovery_kick',
        'calculation_not_ready_15_game_minutes_after_due_time',
        jsonb_build_object(
          'race_name',v_stage.race_name,
          'stage_number',v_stage.stage_number,
          'calculation_due_game_at',v_stage.calculation_due_game_at,
          'current_game_at',v_game_now,
          'run_status',v_latest.status,
          'survival_phase',v_latest.survival_phase,
          'calculation_contract',v_latest.calculation_contract,
          'pass2_scenario_mode',v_latest.pass2_scenario_mode
        )
      );
    end if;
  end loop;

  return jsonb_build_object(
    'status','completed',
    'current_game_at',v_game_now,
    'checked',v_checked,
    'healthy',v_healthy,
    'recovery_needed',v_recovery_needed,
    'runner_kicks',v_runner_kicks,
    'pass1_kicks',v_pass1_kicks,
    'pass2_kicks',v_pass2_kicks,
    'survival_recovery',v_survival,
    'model_version','universal_race_calculation_guard_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_release_supervisor_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lock bigint := hashtext('universal_race_release_supervisor_v1')::bigint;
  v_watchdog jsonb := '{}'::jsonb;
  v_survival jsonb := '{}'::jsonb;
  v_publication jsonb := '{}'::jsonb;
  v_ops jsonb := '{}'::jsonb;
  v_runner_request bigint;
  v_pass1_request bigint;
  v_pass2_request bigint;
  v_secret text;
begin
  if not pg_try_advisory_xact_lock(v_lock) then
    return jsonb_build_object('status','already_running');
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='universal_race_worker_secret_v1'
  limit 1;

  begin
    v_watchdog := public.race_engine_due_stage_watchdog_run_v1();
  exception when others then
    v_watchdog := jsonb_build_object('status','error','message',left(sqlerrm,1000));
  end;

  begin
    v_survival := public.universal_race_stage_survival_recover_v1();
  exception when others then
    v_survival := jsonb_build_object('status','error','message',left(sqlerrm,1000));
  end;

  if v_secret is not null then
    begin
      v_runner_request := net.http_post(
        url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-runner',
        headers := jsonb_build_object('Content-Type','application/json','x-universal-race-worker-secret',v_secret),
        body := '{"action":"tick"}'::jsonb,
        timeout_milliseconds := 30000
      );
    exception when others then null;
    end;

    begin
      v_pass1_request := net.http_post(
        url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-pass1-resume',
        headers := jsonb_build_object('Content-Type','application/json','x-universal-race-worker-secret',v_secret),
        body := '{"action":"tick"}'::jsonb,
        timeout_milliseconds := 30000
      );
    exception when others then null;
    end;

    begin
      v_pass2_request := net.http_post(
        url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-pass2-resume',
        headers := jsonb_build_object('Content-Type','application/json','x-universal-race-worker-secret',v_secret),
        body := '{"action":"tick"}'::jsonb,
        timeout_milliseconds := 30000
      );
    exception when others then null;
    end;
  end if;

  begin
    v_publication := public.universal_race_stage_retry_due_publications_v1(20);
  exception when others then
    v_publication := jsonb_build_object('status','error','message',left(sqlerrm,1000));
  end;

  begin
    v_ops := public.race_operations_refresh_v1();
  exception when others then
    v_ops := jsonb_build_object('status','error','message',left(sqlerrm,1000));
  end;

  return jsonb_build_object(
    'status','completed',
    'watchdog',v_watchdog,
    'survival',v_survival,
    'publication',v_publication,
    'operations',v_ops,
    'runner_request_id',v_runner_request,
    'pass1_request_id',v_pass1_request,
    'pass2_request_id',v_pass2_request,
    'model_version','universal_race_release_supervisor_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_apply_missing_stage_equipment_wear_v2(p_simulation_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_stage_id uuid;
  v_race_id uuid;
  v_stage_distance_km numeric := 0;
  v_stage_date date;
  v_phase9 jsonb;
  v_equipment jsonb := '{}'::jsonb;
  v_entry record;
  v_inventory record;
  v_loss numeric;
  v_condition_after numeric;
  v_log_id uuid;
  v_candidates integer := 0;
  v_user_candidates integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
begin
  select rr.stage_id, rr.race_id, coalesce(rs.distance_km,0), rs.stage_date
  into v_stage_id, v_race_id, v_stage_distance_km, v_stage_date
  from public.race_stage_simulation_runs rr
  join public.race_stages rs on rs.id = rr.stage_id
  where rr.id = p_simulation_run_id;

  if not found then
    raise exception 'Simulation run % not found', p_simulation_run_id;
  end if;

  if exists (
    select 1
    from public.race_engine_stage_wear_applications w
    where w.simulation_run_id = p_simulation_run_id
      and w.target_type = 'equipment'
      and w.target_table = 'club_equipment_inventory'
  ) then
    return jsonb_build_object(
      'ok', true,
      'status', 'canonical_equipment_wear_present',
      'simulation_run_id', p_simulation_run_id,
      'stage_id', v_stage_id
    );
  end if;

  select public.race_engine_get_stage_phase9_inputs_v1(v_stage_id)
  into v_phase9;

  v_equipment := coalesce(v_phase9 -> 'preparation' -> 'equipment', '{}'::jsonb);

  for v_entry in
    select key, value
    from jsonb_each(v_equipment)
    order by key
  loop
    v_candidates := v_candidates + 1;

    select
      cei.id,
      cei.club_id,
      cei.equipment_category,
      cei.condition_percent
    into v_inventory
    from public.club_equipment_inventory cei
    join public.clubs c on c.id = cei.club_id
    where cei.id = v_entry.key::uuid
      and not coalesce(c.is_ai,false)
    for update of cei;

    if not found then
      continue;
    end if;

    v_user_candidates := v_user_candidates + 1;
    v_loss := greatest(0, (v_stage_distance_km / 100.0) * 0.35);
    v_condition_after := greatest(
      0,
      least(100, coalesce(v_inventory.condition_percent,100) - v_loss)
    );

    v_log_id := null;

    insert into public.race_engine_stage_wear_applications (
      simulation_run_id,
      race_id,
      stage_id,
      target_type,
      target_table,
      target_id,
      club_id,
      target_key,
      condition_loss,
      applied_game_date,
      metadata
    )
    values (
      p_simulation_run_id,
      v_race_id,
      v_stage_id,
      'equipment',
      'club_equipment_inventory',
      v_inventory.id,
      v_inventory.club_id,
      v_inventory.equipment_category,
      v_loss,
      v_stage_date,
      jsonb_build_object(
        'source', 'phase11_equipment_wear_compat_v2',
        'reason', 'canonical application manifest omitted user equipment resources',
        'phase9_resource', v_entry.value,
        'stage_distance_km', v_stage_distance_km,
        'condition_before_apply', v_inventory.condition_percent,
        'condition_after_apply', v_condition_after
      )
    )
    on conflict (simulation_run_id, target_type, target_table, target_id)
    do nothing
    returning id into v_log_id;

    if v_log_id is not null then
      v_inserted := v_inserted + 1;

      update public.club_equipment_inventory cei
      set
        condition_percent = v_condition_after,
        last_used_game_date = coalesce(v_stage_date, cei.last_used_game_date),
        total_distance_km = coalesce(cei.total_distance_km,0) + v_stage_distance_km,
        total_race_days = coalesce(cei.total_race_days,0) + 1,
        updated_at = clock_timestamp()
      where cei.id = v_inventory.id;

      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'status', case
      when v_candidates = 0 then 'no_equipment_candidates'
      when v_user_candidates = 0 then 'no_user_equipment_candidates'
      else 'processed'
    end,
    'simulation_run_id', p_simulation_run_id,
    'stage_id', v_stage_id,
    'equipment_candidate_count', v_candidates,
    'user_equipment_candidate_count', v_user_candidates,
    'equipment_log_inserted_count', v_inserted,
    'equipment_updated_count', v_updated
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_overview_race_schedule_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current_game_date date;
  v_upcoming_schedule jsonb := '[]'::jsonb;
  v_today_races jsonb := '[]'::jsonb;
begin
  if p_club_id is null then
    return jsonb_build_object(
      'upcomingSchedule', '[]'::jsonb,
      'todayRaces', '[]'::jsonb
    );
  end if;

  v_current_game_date := public.get_current_game_date_date();

  if v_current_game_date is null then
    v_current_game_date := make_date(
      1999 + coalesce(public.get_current_season_number(), 1),
      1,
      1
    );
  end if;

  with club_scope as (
    select p_club_id::text as club_id
    union all
    select c.id::text
    from public.clubs c
    where c.parent_club_id = p_club_id
      and c.club_type = 'developing'
      and c.deleted_at is null
  ),
  accepted_races as (
    select distinct on (r.id)
      r.id as race_id,
      r.name as race_name,
      coalesce(
        nullif(to_jsonb(r)->>'race_category', ''),
        nullif(to_jsonb(r)->>'category', ''),
        nullif(to_jsonb(r)->>'class', ''),
        nullif(to_jsonb(r)->>'race_class', '')
      ) as race_category,
      coalesce(
        nullif(to_jsonb(r)->>'country_code', ''),
        nullif(to_jsonb(r)->>'host_country_code', ''),
        nullif(to_jsonb(r)->>'countryCode', ''),
        nullif(to_jsonb(r)->>'hostCountryCode', ''),
        nullif(to_jsonb(r)->>'nation_code', ''),
        case
          when lower(r.name) like '%black river gorges%' then 'MU'
          when lower(r.name) like '%mauritius%' then 'MU'
          when lower(r.name) like '%guadeloupe%' then 'GP'
          when lower(r.name) like '%namib%' then 'NA'
          when lower(r.name) like '%faso%' then 'BF'
          when lower(r.name) like '%israel%' then 'IL'
          else null
        end
      ) as race_country_code,
      (
        select min(stage.stage_date)
        from public.race_stages stage
        where stage.race_id = r.id
          and stage.stage_date >= v_current_game_date
      ) as next_stage_date,
      rp.updated_at
    from public.race_preparations rp
    join public.races r
      on r.id = rp.race_id
    where (
      nullif(to_jsonb(rp)->>'participating_club_id', '') in (
        select club_id from club_scope
      )
      or nullif(to_jsonb(rp)->>'owner_club_id', '') in (
        select club_id from club_scope
      )
      or nullif(to_jsonb(rp)->>'club_id', '') in (
        select club_id from club_scope
      )
      or nullif(to_jsonb(rp)->>'team_id', '') in (
        select club_id from club_scope
      )
    )
      and lower(coalesce(to_jsonb(rp)->>'status', '')) not in (
        'declined','rejected','cancelled','canceled','withdrawn'
      )
      and lower(coalesce(to_jsonb(rp)->>'startlist_status', '')) not in (
        'declined','rejected','cancelled','canceled','withdrawn'
      )
      and lower(coalesce(r.status::text, '')) not in (
        'completed','cancelled','canceled'
      )
      and exists (
        select 1
        from public.race_stages stage
        where stage.race_id = r.id
          and stage.stage_date >= v_current_game_date
      )
    order by r.id, rp.updated_at desc nulls last
  ),
  upcoming as (
    select
      ar.race_id,
      ar.race_name,
      ar.race_category,
      ar.race_country_code,
      stage.stage_number,
      stage.stage_date,
      coalesce(to_jsonb(stage)->>'route_label', '') as route_label,
      (
        select count(*)::integer
        from public.race_stages count_stage
        where count_stage.race_id = ar.race_id
      ) as stage_count
    from accepted_races ar
    join public.race_stages stage
      on stage.race_id = ar.race_id
     and stage.stage_date = ar.next_stage_date
    where ar.next_stage_date is not null
    order by stage.stage_date asc, ar.race_name asc
    limit 5
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', race_id::text,
        'dateLabel', to_char(stage_date, 'Mon DD'),
        'title', race_name,
        'countryCode', race_country_code,
        'subtitle', concat_ws(
          ' · ',
          nullif(race_category, ''),
          'Stage ' || stage_number::text,
          case
            when stage_count > 1 then stage_count::text || ' stages'
            else null
          end,
          nullif(route_label, '')
        ),
        'href', '#/dashboard/races/' || race_id::text
      )
      order by stage_date asc, race_name asc
    ),
    '[]'::jsonb
  )
  into v_upcoming_schedule
  from upcoming;

  with today as (
    select
      r.id as race_id,
      r.name as race_name,
      coalesce(
        nullif(to_jsonb(r)->>'race_category', ''),
        nullif(to_jsonb(r)->>'category', ''),
        nullif(to_jsonb(r)->>'class', ''),
        nullif(to_jsonb(r)->>'race_class', '')
      ) as race_category,
      coalesce(
        nullif(to_jsonb(r)->>'country_code', ''),
        nullif(to_jsonb(r)->>'host_country_code', ''),
        nullif(to_jsonb(r)->>'countryCode', ''),
        nullif(to_jsonb(r)->>'hostCountryCode', ''),
        nullif(to_jsonb(r)->>'nation_code', ''),
        case
          when lower(r.name) like '%black river gorges%' then 'MU'
          when lower(r.name) like '%mauritius%' then 'MU'
          when lower(r.name) like '%guadeloupe%' then 'GP'
          when lower(r.name) like '%namib%' then 'NA'
          when lower(r.name) like '%faso%' then 'BF'
          when lower(r.name) like '%israel%' then 'IL'
          else null
        end
      ) as race_country_code,
      stage.stage_number,
      stage.stage_date,
      coalesce(
        nullif(to_jsonb(stage)->>'stage_format', ''),
        nullif(to_jsonb(stage)->>'terrain_type', ''),
        'road_race'
      ) as stage_format,
      coalesce(to_jsonb(stage)->>'route_label', '') as route_label
    from public.race_stages stage
    join public.races r
      on r.id = stage.race_id
    where stage.stage_date = v_current_game_date
      and lower(coalesce(r.status::text, '')) not in ('cancelled','canceled')
    order by r.name asc, stage.stage_number asc
    limit 20
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', race_id::text || ':' || stage_number::text,
        'timeLabel', 'Today',
        'title', race_name,
        'countryCode', race_country_code,
        'subtitle', concat_ws(
          ' ',
          'Stage ' || stage_number::text ||
            case
              when nullif(race_category, '') is not null
                then ' of this ' || race_category || ' race'
              else ''
            end || ' is scheduled today.',
          case
            when nullif(stage_format, '') is not null
              then 'Race type: ' || initcap(replace(stage_format, '_', ' ')) || '.'
            else null
          end,
          case
            when nullif(route_label, '') is not null
              then 'Route: ' || route_label || '.'
            else null
          end
        ),
        'href', '#/dashboard/races/' || race_id::text
      )
      order by race_name asc, stage_number asc
    ),
    '[]'::jsonb
  )
  into v_today_races
  from today;

  return jsonb_build_object(
    'upcomingSchedule', v_upcoming_schedule,
    'todayRaces', v_today_races
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_contiguous_race_stage_calendar_v1(p_race_id uuid, p_force boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_start_date date;
  v_end_date date;
  v_stage_count integer;
  v_race_metadata jsonb;
  v_row_count integer;
  v_distinct_stage_numbers integer;
  v_min_stage_number integer;
  v_max_stage_number integer;
  v_changed integer := 0;
begin
  select
    r.start_date::date,
    r.end_date::date,
    r.stage_count,
    coalesce(r.metadata, '{}'::jsonb)
  into
    v_start_date,
    v_end_date,
    v_stage_count,
    v_race_metadata
  from public.races r
  where r.id = p_race_id;

  if not found
     or v_start_date is null
     or v_end_date is null
     or coalesce(v_stage_count, 0) <= 1
  then
    return 0;
  end if;

  -- Only normalize races whose published span means exactly one stage per day.
  -- Date arithmetic is intentionally used so leap days such as 2000-02-29
  -- are handled by PostgreSQL rather than hand-built month/day logic.
  if v_stage_count <> (v_end_date - v_start_date + 1) then
    return 0;
  end if;

  -- Explicit escape hatch for a deliberately unusual split-stage calendar.
  if lower(coalesce(v_race_metadata->>'allow_same_day_stages', 'false'))
       in ('true', '1', 'yes', 'on')
  then
    return 0;
  end if;

  select
    count(*)::integer,
    count(distinct s.stage_number)::integer,
    min(s.stage_number),
    max(s.stage_number)
  into
    v_row_count,
    v_distinct_stage_numbers,
    v_min_stage_number,
    v_max_stage_number
  from public.race_stages s
  where s.race_id = p_race_id;

  if v_row_count <> v_stage_count
     or v_distinct_stage_numbers <> v_stage_count
     or v_min_stage_number <> 1
     or v_max_stage_number <> v_stage_count
  then
    return 0;
  end if;

  -- For normal future imports, do not rewrite a race once authoritative
  -- calculations exist. Existing bad schedules can be repaired explicitly
  -- with p_force=true.
  if not p_force
     and exists (
       select 1
       from public.race_stage_authoritative_runs authority
       join public.race_stages stage on stage.id = authority.stage_id
       where stage.race_id = p_race_id
     )
  then
    return 0;
  end if;

  update public.race_stages stage
  set
    stage_date = v_start_date + (stage.stage_number - 1),
    metadata = jsonb_set(
      coalesce(stage.metadata, '{}'::jsonb),
      '{actual_stage_date}',
      to_jsonb(
        format(
          'S%s %s',
          extract(year from (v_start_date + (stage.stage_number - 1)))::integer - 1999,
          to_char(v_start_date + (stage.stage_number - 1), 'MM.DD')
        )
      ),
      true
    ),
    updated_at = clock_timestamp()
  where stage.race_id = p_race_id
    and (
      stage.stage_date is distinct from (v_start_date + (stage.stage_number - 1))
      or coalesce(stage.metadata->>'actual_stage_date', '') is distinct from
         format(
           'S%s %s',
           extract(year from (v_start_date + (stage.stage_number - 1)))::integer - 1999,
           to_char(v_start_date + (stage.stage_number - 1), 'MM.DD')
         )
    );

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_normalize_contiguous_calendar_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  perform public.normalize_contiguous_race_stage_calendar_v1(new.race_id, false);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_normalize_contiguous_stage_calendar_trigger_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  perform public.normalize_contiguous_race_stage_calendar_v1(new.id, false);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_overview_recent_race_results_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_today date;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  v_today := public.get_current_game_date_date();

  if v_today is null then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stage_id', row_data.stage_id,
        'race_id', row_data.race_id,
        'race_name', row_data.race_name,
        'country_code', row_data.country_code,
        'stage_number', row_data.stage_number,
        'stage_count', row_data.stage_count,
        'stage_date', row_data.stage_date,
        'stage_name', row_data.stage_name,
        'start_city', row_data.start_city,
        'finish_city', row_data.finish_city,

        'winner_rider_id', row_data.winner_rider_id,
        'winner_name', row_data.winner_name,
        'winner_team_id', row_data.winner_team_id,
        'winner_team_name', row_data.winner_team_name,

        'gc_rider_id', row_data.gc_rider_id,
        'gc_name', row_data.gc_name,
        'gc_team_id', row_data.gc_team_id,
        'gc_team_name', row_data.gc_team_name,

        'mountain_rider_id', row_data.mountain_rider_id,
        'mountain_name', row_data.mountain_name,
        'mountain_team_id', row_data.mountain_team_id,
        'mountain_team_name', row_data.mountain_team_name,
        'mountain_points', row_data.mountain_points,

        'points_rider_id', row_data.points_rider_id,
        'points_name', row_data.points_name,
        'points_team_id', row_data.points_team_id,
        'points_team_name', row_data.points_team_name,
        'points_total', row_data.points_total
      )
      order by row_data.stage_date desc, row_data.race_name, row_data.stage_number
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      stage.id as stage_id,
      race.id as race_id,
      race.name as race_name,
      nullif(
        coalesce(
          to_jsonb(race)->>'country_code',
          to_jsonb(race)->>'host_country_code',
          to_jsonb(race)->>'country_iso2',
          to_jsonb(race)->>'country_iso'
        ),
        ''
      ) as country_code,
      stage.stage_number,
      coalesce(race.stage_count, 1) as stage_count,
      stage.stage_date::date as stage_date,
      nullif(stage.name, '') as stage_name,
      nullif(coalesce(stage.start_city_name, stage.start_city), '') as start_city,
      nullif(coalesce(stage.finish_city_name, stage.finish_city), '') as finish_city,

      winner.rider_id as winner_rider_id,
      coalesce(
        nullif(winner.rider_name_snapshot, ''),
        nullif(to_jsonb(winner_rider)->>'display_name', ''),
        nullif(to_jsonb(winner_rider)->>'full_name', ''),
        nullif(trim(concat_ws(' ', to_jsonb(winner_rider)->>'first_name', to_jsonb(winner_rider)->>'last_name')), ''),
        winner.rider_id::text
      ) as winner_name,
      winner.team_id as winner_team_id,
      nullif(winner.team_name_snapshot, '') as winner_team_name,

      gc.rider_id as gc_rider_id,
      nullif(gc.display_name_snapshot, '') as gc_name,
      gc.team_id as gc_team_id,
      nullif(gc.team_name_snapshot, '') as gc_team_name,

      mountain.rider_id as mountain_rider_id,
      nullif(mountain.display_name_snapshot, '') as mountain_name,
      mountain.team_id as mountain_team_id,
      nullif(mountain.team_name_snapshot, '') as mountain_team_name,
      mountain.points as mountain_points,

      points.rider_id as points_rider_id,
      nullif(points.display_name_snapshot, '') as points_name,
      points.team_id as points_team_id,
      nullif(points.team_name_snapshot, '') as points_team_name,
      points.points as points_total
    from public.race_stages stage
    join public.races race on race.id = stage.race_id
    join public.race_stage_results winner
      on winner.stage_id = stage.id
     and winner.rank = 1
    left join public.riders winner_rider on winner_rider.id = winner.rider_id
    left join public.race_classification_standings gc
      on gc.race_id = race.id
     and gc.after_stage_id = stage.id
     and gc.classification_type = 'general'
     and gc.entity_type = 'rider'
     and gc.rank = 1
    left join public.race_classification_standings mountain
      on mountain.race_id = race.id
     and mountain.after_stage_id = stage.id
     and mountain.classification_type = 'mountain'
     and mountain.entity_type = 'rider'
     and mountain.rank = 1
    left join public.race_classification_standings points
      on points.race_id = race.id
     and points.after_stage_id = stage.id
     and points.classification_type = 'points'
     and points.entity_type = 'rider'
     and points.rank = 1
    where stage.stage_date::date between v_today - 1 and v_today
  ) row_data;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fill_race_ai_teams_hierarchy_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race record;
  v_rules record;
  v_current_count integer := 0;
  v_target_count integer := 0;
  v_needed integer := 0;
  v_inserted integer := 0;
  v_after_count integer := 0;
  v_assignment jsonb := '{}'::jsonb;
  v_added_by_tier jsonb := '{}'::jsonb;
begin
  if p_race_id is null then
    return jsonb_build_object('success',false,'error','race_id_required');
  end if;

  perform pg_advisory_xact_lock(
    hashtext('fill_race_ai_teams_hierarchy_v1'),
    hashtext(p_race_id::text)
  );

  select * into v_race
  from public.races
  where id=p_race_id;

  if not found then
    return jsonb_build_object('success',false,'error','race_not_found');
  end if;

  select * into v_rules
  from public.race_entry_rules
  where race_id=p_race_id
  limit 1;

  if not found then
    return jsonb_build_object('success',false,'error','race_entry_rules_not_found');
  end if;

  select count(*)::integer
  into v_current_count
  from public.race_team_entries e
  where e.race_id=p_race_id
    and e.status in ('accepted','confirmed');

  /*
   * Normal race-specific policy has already had first choice before this helper.
   * The hierarchy only fills a shortage. Aim for target_teams, but never exceed
   * max_teams, and never settle below min_teams when candidates exist.
   */
  v_target_count := least(
    greatest(
      coalesce(v_rules.target_teams,0),
      coalesce(v_rules.min_teams,0),
      v_current_count
    ),
    greatest(
      coalesce(v_rules.max_teams,v_rules.target_teams,v_rules.min_teams,v_current_count),
      v_current_count
    )
  );

  v_needed := greatest(v_target_count-v_current_count,0);

  if v_needed = 0 then
    return jsonb_build_object(
      'success',true,
      'race_id',p_race_id,
      'policy','universal_tier_hierarchy_v1',
      'current_teams',v_current_count,
      'target_teams',v_target_count,
      'teams_added',0,
      'added_by_tier','{}'::jsonb,
      'message','Field already meets the target size.'
    );
  end if;

  create temporary table if not exists pg_temp.race_hierarchy_candidates_v1(
    club_id uuid primary key,
    club_name text,
    club_tier text,
    tier_rank integer,
    world_tier integer,
    reputation numeric,
    geographic_priority integer,
    available_riders integer
  ) on commit drop;

  truncate table pg_temp.race_hierarchy_candidates_v1;

  insert into pg_temp.race_hierarchy_candidates_v1(
    club_id,club_name,club_tier,tier_rank,world_tier,reputation,
    geographic_priority,available_riders
  )
  select
    pool.id,
    pool.name,
    pool.club_tier::text,
    case pool.club_tier::text
      when 'worldteam' then 1
      when 'proteam' then 2
      when 'continental' then 3
      when 'amateur' then 4
      else 99
    end,
    pool.world_tier,
    pool.reputation,
    public.race_ai_geographic_priority_v1(v_race.country_code,pool.country_code),
    available.available_riders
  from public.ai_competition_filler_club_pool_v1 pool
  cross join lateral (
    select count(*)::integer as available_riders
    from public.club_roster cr
    where cr.club_id=pool.id
      and public.roster_status_allows_race_selection_v1(cr.availability_status)

      /* Same rider may not be used twice in the same race. */
      and not exists (
        select 1
        from public.race_participant_riders same_race
        where same_race.race_id=p_race_id
          and same_race.rider_id=cr.rider_id
      )

      /*
       * A club MAY race simultaneously with separate squads.
       * Only riders already selected in another overlapping race are excluded.
       */
      and not exists (
        select 1
        from public.race_participant_riders other_participation
        join public.races other_race
          on other_race.id=other_participation.race_id
        where other_participation.rider_id=cr.rider_id
          and other_participation.race_id<>p_race_id
          and daterange(
                other_race.start_date,
                coalesce(other_race.end_date,other_race.start_date)+1,
                '[)'
              )
              &&
              daterange(
                v_race.start_date,
                coalesce(v_race.end_date,v_race.start_date)+1,
                '[)'
              )
      )

      /* Protect riders already chosen in a human race plan for this race. */
      and not exists (
        select 1
        from public.race_preparation_riders pr
        join public.race_preparations prep
          on prep.id=pr.race_preparation_id
        where prep.race_id=p_race_id
          and pr.rider_id=cr.rider_id
      )
  ) available
  where coalesce(pool.is_active,true)=true
    and coalesce(pool.is_ai,true)=true
    and coalesce(pool.logo_path,'')<>''
    and pool.club_tier::text in ('worldteam','proteam','continental','amateur')
    and available.available_riders >= coalesce(v_rules.min_riders_per_team,4)

    /* Do not duplicate or resurrect an existing entry row for this race. */
    and not exists (
      select 1
      from public.race_team_entries existing
      where existing.race_id=p_race_id
        and (
          existing.club_id=pool.id
          or existing.participating_club_id=pool.id
        )
    );

  with picked as (
    select c.*
    from pg_temp.race_hierarchy_candidates_v1 c
    order by
      c.tier_rank asc,
      coalesce(c.world_tier,99) asc,
      c.available_riders desc,
      coalesce(c.reputation,0) desc,
      c.geographic_priority asc,
      c.club_id
    limit v_needed
  ),
  inserted as (
    insert into public.race_team_entries(
      id,race_id,club_id,participating_club_id,status,entry_source,
      is_ai_filler,auto_filled_at,commitment_score_snapshot,acceptance_score,
      review_round,decision_reason,reviewed_at,final_decision_at,created_at,updated_at
    )
    select
      gen_random_uuid(),
      p_race_id,
      p.club_id,
      p.club_id,
      'accepted',
      'ai_fill',
      true,
      now(),
      null,
      null,
      1,
      'AI fallback team added by universal tier hierarchy: WorldTeam -> ProTeam -> Continental -> Amateur. Club overlap is allowed when distinct riders are available.',
      now(),now(),now(),now()
    from picked p
    on conflict (race_id,club_id) do nothing
    returning club_id
  )
  select count(*)::integer
  into v_inserted
  from inserted;

  /*
   * Populate the newly accepted teams. This routine independently enforces the
   * rider-level overlap rule, so simultaneous club squads cannot share riders.
   */
  select public.assign_ai_riders_to_race_v1(p_race_id)
  into v_assignment;

  select count(*)::integer
  into v_after_count
  from public.race_team_entries e
  where e.race_id=p_race_id
    and e.status in ('accepted','confirmed');

  select coalesce(
    jsonb_object_agg(tier,team_count),
    '{}'::jsonb
  )
  into v_added_by_tier
  from (
    select c.club_tier as tier,count(*)::integer as team_count
    from pg_temp.race_hierarchy_candidates_v1 c
    join public.race_team_entries e
      on e.race_id=p_race_id
     and e.club_id=c.club_id
     and e.status in ('accepted','confirmed')
     and e.decision_reason like 'AI fallback team added by universal tier hierarchy:%'
    group by c.club_tier
  ) x;

  update public.races r
  set metadata=coalesce(r.metadata,'{}'::jsonb) || jsonb_build_object(
        'universal_ai_hierarchy_fill_checked_at',now(),
        'universal_ai_hierarchy_fill_policy','worldteam_proteam_continental_amateur_v1',
        'universal_ai_hierarchy_teams_before',v_current_count,
        'universal_ai_hierarchy_teams_after',v_after_count,
        'universal_ai_hierarchy_target_teams',v_target_count
      ),
      updated_at=now()
  where r.id=p_race_id;

  return jsonb_build_object(
    'success',v_after_count >= coalesce(v_rules.min_teams,0),
    'race_id',p_race_id,
    'race_name',v_race.name,
    'policy','universal_tier_hierarchy_v1',
    'hierarchy',jsonb_build_array('worldteam','proteam','continental','amateur'),
    'club_overlap_allowed_with_distinct_riders',true,
    'minimum_teams',coalesce(v_rules.min_teams,0),
    'target_teams',v_target_count,
    'teams_before',v_current_count,
    'teams_added',v_inserted,
    'teams_after',v_after_count,
    'added_by_tier',v_added_by_tier,
    'rider_assignment_result',v_assignment
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_prior_same_team_jersey_reservations_v1(p_stage_id uuid, p_sporting_team_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage_date date;
  v_stage_order_ts timestamp without time zone;
  v_reserved integer := 0;
  v_one integer := 0;
  x record;
begin
  if p_stage_id is null or p_sporting_team_id is null then
    return 0;
  end if;

  select
    s.stage_date::date,
    s.stage_date::timestamp
      + make_interval(
          hours => greatest(0, least(23, coalesce(s.planned_start_hour_number, 12))),
          mins  => greatest(0, least(59, coalesce(s.planned_start_minute, 0)))
        )
  into v_stage_date, v_stage_order_ts
  from public.race_stages s
  where s.id = p_stage_id;

  if v_stage_date is null or v_stage_order_ts is null then
    return 0;
  end if;

  for x in
    select
      s.id as stage_id,
      s.race_id,
      s.stage_number,
      s.stage_date::timestamp
        + make_interval(
            hours => greatest(0, least(23, coalesce(s.planned_start_hour_number, 12))),
            mins  => greatest(0, least(59, coalesce(s.planned_start_minute, 0)))
          ) as stage_order_ts
    from public.race_stages s
    join public.races r
      on r.id = s.race_id
    join public.race_participant_teams_v1 t
      on t.race_id = s.race_id
     and t.club_id = p_sporting_team_id
    where s.stage_date::date = v_stage_date
      and s.id <> p_stage_id
      and lower(coalesce(r.status, 'scheduled')) in ('scheduled', 'active')
      and not coalesce(s.weather_cancelled, false)
      and lower(coalesce(t.status, 'accepted')) = 'accepted'
      and not exists (
        select 1
        from public.race_stage_authoritative_runs a
        where a.stage_id = s.id
      )
      and not public.universal_race_team_disqualified_for_stage_v1(
        s.race_id,
        p_sporting_team_id,
        s.stage_number
      )
      and (
        (
          s.stage_date::timestamp
            + make_interval(
                hours => greatest(0, least(23, coalesce(s.planned_start_hour_number, 12))),
                mins  => greatest(0, least(59, coalesce(s.planned_start_minute, 0)))
              )
        ) < v_stage_order_ts
        or (
          (
            s.stage_date::timestamp
              + make_interval(
                  hours => greatest(0, least(23, coalesce(s.planned_start_hour_number, 12))),
                  mins  => greatest(0, least(59, coalesce(s.planned_start_minute, 0)))
                )
          ) = v_stage_order_ts
          and s.id::text < p_stage_id::text
        )
      )
    order by stage_order_ts, s.id
  loop
    v_one := public.universal_race_team_required_jerseys_v1(
      x.race_id,
      p_sporting_team_id
    );
    v_reserved := v_reserved + greatest(coalesce(v_one, 0), 0);
  end loop;

  return greatest(v_reserved, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_season_migration_process_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_game public.game_state%rowtype;
  v_game_date date;
  v_game_ts timestamptz;
  v_next_source integer;
  v_next_target integer;
  v_source integer;
  v_target integer;
  v_source_end date;
  v_target_start date;
  v_readiness jsonb;
  v_persistence jsonb;
  v_control public.season_transition_control_v1%rowtype;
  v_run public.season_transition_engine_runs_v2%rowtype;
  v_active_run_found boolean := false;
  v_pair_run_found boolean := false;
  v_blocking_components integer := 0;
  v_required_components integer := 0;
  v_ready_components integer := 0;
  v_exact_pair_armed boolean := false;
  v_wrong_pair_armed boolean := false;
  v_events jsonb := '[]'::jsonb;
  v_history jsonb := '[]'::jsonb;
  v_checkpoints jsonb := '[]'::jsonb;
  v_backlog jsonb := null;
  v_checklist jsonb := '[]'::jsonb;
  v_overall_status text := 'waiting';
  v_problem_count integer := 0;
  v_run_status text := null;
  v_run_error text := null;
  v_core_done boolean := false;
  v_rewards_done boolean := false;
  v_comms_done boolean := false;
  v_final_done boolean := false;
  v_resumed boolean := false;
  v_at_source_end boolean := false;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select *
  into v_game
  from public.game_state
  where id = true;

  if not found then
    raise exception 'game_state is not initialized';
  end if;

  v_game_date := public.get_current_game_date_date();
  v_game_ts := public.get_current_game_timestamp();
  v_next_source := v_game.season_number;
  v_next_target := v_next_source + 1;

  /*
   * Prefer an unfinished production run, because that is the migration an
   * administrator must currently diagnose. Otherwise the page becomes the
   * checklist for the next N -> N+1 transition.
   */
  select *
  into v_run
  from public.season_transition_engine_runs_v2 r
  where r.mode = 'production'
    and r.status <> 'completed'
  order by r.created_at desc
  limit 1;

  v_active_run_found := found;

  if v_active_run_found then
    v_source := v_run.source_season;
    v_target := v_run.target_season;
    v_pair_run_found := true;
  else
    v_source := v_next_source;
    v_target := v_next_target;
    /*
     * Completed production runs belong to History, not to the live checklist.
     * This matters after rollback/lab verification: an old successful run must
     * never make the next real transition appear partially completed.
     */
    v_pair_run_found := false;
  end if;

  v_source_end := public.get_game_date_for_season_end(v_source);
  v_target_start := public.get_game_date_for_season_start(v_target);
  v_at_source_end := v_game.season_number = v_source and v_game_date = v_source_end;

  v_readiness := public.get_season_transition_preflight_v1();
  v_persistence := public.get_season_transition_persistence_guard_status_v1();

  v_required_components :=
    coalesce((v_readiness ->> 'required_components')::integer, 0);
  v_ready_components :=
    coalesce((v_readiness ->> 'ready_components')::integer, 0);
  v_blocking_components :=
    coalesce((v_readiness ->> 'blocking_components')::integer, 0);

  select *
  into v_control
  from public.season_transition_control_v1
  where id = true;

  if found then
    v_exact_pair_armed :=
      coalesce(v_control.is_armed, false)
      and v_control.armed_source_season = v_source
      and v_control.armed_target_season = v_target;

    v_wrong_pair_armed :=
      coalesce(v_control.is_armed, false)
      and not v_exact_pair_armed;
  end if;

  if v_pair_run_found then
    v_run_status := v_run.status;
    v_run_error := v_run.error_message;

    v_core_done := v_run.status in (
      'core_validated','rewards_applied','communication_pending',
      'communication_done','final_validated','completed'
    );
    v_rewards_done := v_run.status in (
      'rewards_applied','communication_pending','communication_done',
      'final_validated','completed'
    );
    v_comms_done := v_run.status in (
      'communication_done','final_validated','completed'
    );
    v_final_done := v_run.status = 'completed';
    v_resumed :=
      v_run.status = 'completed'
      and nullif(v_run.metadata ->> 'resumed_at', '') is not null;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'phase', e.phase,
          'event_type', e.event_type,
          'payload', e.payload,
          'created_at', e.created_at
        )
        order by e.id desc
      ),
      '[]'::jsonb
    )
    into v_events
    from (
      select *
      from public.season_transition_engine_events_v2
      where run_id = v_run.id
      order by id desc
      limit 100
    ) e;
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(h) order by h.created_at desc),
    '[]'::jsonb
  )
  into v_history
  from (
    select
      r.id,
      r.source_season,
      r.target_season,
      r.mode,
      r.status,
      r.source_end_date,
      r.target_start_date,
      r.error_message,
      r.created_at,
      r.source_frozen_at,
      r.core_applied_at,
      r.completed_at,
      r.updated_at,
      nullif(r.metadata ->> 'resumed_at', '') as resumed_at
    from public.season_transition_engine_runs_v2 r
    where r.mode = 'production'
    order by r.created_at desc
    limit 10
  ) h;

  select coalesce(
    jsonb_agg(to_jsonb(c) order by c.created_at desc),
    '[]'::jsonb
  )
  into v_checkpoints
  from (
    select
      cp.id,
      cp.label,
      cp.source_season,
      cp.source_end_date,
      cp.restore_method,
      cp.status,
      cp.notes,
      cp.created_at,
      cp.verified_at,
      cp.updated_at
    from public.season_transition_lab_checkpoints_v1 cp
    order by cp.created_at desc
    limit 10
  ) c;

  select to_jsonb(b)
  into v_backlog
  from (
    select
      d.id,
      d.current_game_date,
      d.season_number,
      d.month_number,
      d.day_number,
      d.status,
      d.attempts,
      d.source,
      d.last_error,
      d.processed_at,
      d.created_at,
      d.updated_at
    from public.game_daily_tick_backlog_v1 d
    where d.current_game_date = v_target_start
    order by d.created_at desc
    limit 1
  ) b;

  /*
   * Permanent operational checklist.
   * "blocked" always means the game should remain paused / the transition
   * should not advance until the displayed problem is repaired.
   */
  v_checklist := jsonb_build_array(
    jsonb_build_object(
      'order', 1,
      'key', 'component_readiness',
      'title', 'Preflight readiness',
      'description', 'All required season-transition components must be certified before the boundary can be armed.',
      'status', case
        when v_blocking_components = 0 and v_required_components > 0 then 'ready'
        else 'blocked'
      end,
      'detail', format('%s/%s required components ready', v_ready_components, v_required_components),
      'problem', case
        when v_blocking_components > 0
          then format('%s required component(s) are not ready.', v_blocking_components)
        else null
      end,
      'remediation', case
        when v_blocking_components > 0
          then 'Open the readiness checklist below, repair every non-ready required component, then refresh this page. Do not force the boundary.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 2,
      'key', 'arm_pair',
      'title', 'Arm exact season pair',
      'description', format('The transition control must be armed for Season %s -> Season %s. The boundary controller can auto-arm only when all readiness checks are green.', v_source, v_target),
      'status', case
        when v_exact_pair_armed then 'done'
        when v_wrong_pair_armed then 'blocked'
        when v_blocking_components > 0 then 'blocked'
        else 'waiting'
      end,
      'detail', case
        when v_exact_pair_armed then 'Exact source/target pair is armed.'
        when v_wrong_pair_armed then format('Control is armed for Season %s -> Season %s.', v_control.armed_source_season, v_control.armed_target_season)
        else 'Not armed yet; automatic arming is allowed only with a green readiness gate.'
      end,
      'problem', case
        when v_wrong_pair_armed then 'A different season pair is armed.'
        when v_blocking_components > 0 then 'Readiness gate is not fully green.'
        else null
      end,
      'remediation', case
        when v_wrong_pair_armed then 'Disarm the incorrect pair, verify the source/target seasons, and arm only the exact pair after readiness is green.'
        when v_blocking_components > 0 then 'Resolve the blocking readiness components first.'
        else 'No manual action is required before the boundary unless an administrator intentionally pre-arms the pair.'
      end
    ),
    jsonb_build_object(
      'order', 3,
      'key', 'boundary_pause',
      'title', 'Pause at Dec 31 -> Jan 1 boundary',
      'description', 'The ordinary game clock must not write Jan 1 directly. The v2 boundary controller takes ownership, pauses both clock/state, and fails closed on any error.',
      'status', case
        when v_pair_run_found and (
          v_run.status in (
            'source_frozen','core_applied','core_validated','rewards_applied',
            'communication_pending','communication_done','final_validated','completed'
          )
          or (v_run.status = 'failed' and coalesce(v_game.is_paused,false))
        ) then 'done'
        when v_at_source_end and coalesce(v_game.is_paused,false) then 'running'
        else 'waiting'
      end,
      'detail', case
        when coalesce(v_game.is_paused,false) then 'Game is currently paused.'
        else format('Automatic trigger is the exact game-date boundary %s -> %s.', v_source_end, v_target_start)
      end,
      'problem', null,
      'remediation', 'If the boundary controller fails, keep the game paused and diagnose the run error before retrying.'
    ),
    jsonb_build_object(
      'order', 4,
      'key', 'freeze_source',
      'title', 'Freeze source season',
      'description', 'Snapshot final standings, reconcile the canonical source snapshot, and verify division winners before any target-season mutations.',
      'status', case
        when v_pair_run_found and v_run.status = 'failed' then 'blocked'
        when v_pair_run_found and v_run.status in (
          'source_frozen','core_applied','core_validated','rewards_applied',
          'communication_pending','communication_done','final_validated','completed'
        ) then 'done'
        when v_pair_run_found and v_run.status = 'created' then 'running'
        else 'waiting'
      end,
      'detail', case
        when v_pair_run_found and v_run.source_frozen_at is not null
          then format('Source frozen at %s.', v_run.source_frozen_at)
        else 'Waiting for the exact season boundary.'
      end,
      'problem', case when v_pair_run_found and v_run.status = 'failed' then v_run.error_message else null end,
      'remediation', case
        when v_pair_run_found and v_run.status = 'failed'
          then 'Repair the source snapshot/date/pause invariant shown by the error. Do not advance the clock. Start a new controlled run only after the cause is understood.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 5,
      'key', 'target_boundary',
      'title', 'Move to target Jan 1 while paused',
      'description', 'After source freeze succeeds, set the game to Season N+1, Jan 1, 00:00 while the game remains paused and queue Jan 1 daily processing.',
      'status', case
        when v_pair_run_found
         and v_game.season_number = v_target
         and v_game_date = v_target_start then 'done'
        else 'waiting'
      end,
      'detail', case
        when v_game.season_number = v_target and v_game_date = v_target_start
          then format('Game is at Season %s · Jan 1%s.', v_target, case when v_game.is_paused then ' and paused' else '' end)
        else format('Target boundary is Season %s · Jan 1.', v_target)
      end,
      'problem', case
        when v_pair_run_found
         and v_run.status in ('source_frozen','core_applied','core_validated','rewards_applied','communication_pending','communication_done')
         and not (v_game.season_number = v_target and v_game_date = v_target_start)
          then 'Transition run exists but the live game is not at its target Jan 1 boundary.'
        else null
      end,
      'remediation', 'The live game must remain at the target Jan 1 boundary until the transition completes.'
    ),
    jsonb_build_object(
      'order', 6,
      'key', 'core_transition',
      'title', 'Atomic core migration',
      'description', 'Calendar, ranking/history snapshot, retirements, competition/inactive clubs, rider and staff contracts, stale negotiations, AI rosters, sponsors, Developing Team and target-state verification run as the core transition.',
      'status', case
        when v_core_done then 'done'
        when v_pair_run_found and v_run.status = 'source_frozen' and v_run.error_message is not null then 'blocked'
        when v_pair_run_found and v_run.status in ('source_frozen','core_applied') then 'running'
        else 'waiting'
      end,
      'detail', case
        when v_core_done then 'Core migration committed and target fresh-state validation passed.'
        when v_pair_run_found and v_run.status = 'source_frozen' and v_run.error_message is not null
          then 'A core attempt failed and was rolled back atomically; the source freeze remains available for retry.'
        else 'Waiting for source freeze and target-boundary handoff.'
      end,
      'problem', case
        when v_pair_run_found and v_run.status = 'source_frozen' and v_run.error_message is not null
          then v_run.error_message
        else null
      end,
      'remediation', case
        when v_pair_run_found and v_run.status = 'source_frozen' and v_run.error_message is not null
          then 'Fix the exact invariant named in the run error, then retry continuation. The failed core mutation was rolled back; do not manually reapply completed-looking partial data.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 7,
      'key', 'rewards',
      'title', 'Apply season rewards',
      'description', 'Apply the guarded, idempotent reward grants only after core validation succeeds.',
      'status', case
        when v_rewards_done then 'done'
        when v_pair_run_found and v_run.status = 'core_validated' and v_run.error_message is not null then 'blocked'
        when v_pair_run_found and v_run.status = 'core_validated' then 'running'
        else 'waiting'
      end,
      'detail', case
        when v_rewards_done then 'Season rewards applied.'
        else 'Rewards remain separated from the core transition and are safe to retry.'
      end,
      'problem', case
        when v_pair_run_found and v_run.status = 'core_validated' and v_run.error_message is not null
          then v_run.error_message
        else null
      end,
      'remediation', case
        when v_pair_run_found and v_run.status = 'core_validated' and v_run.error_message is not null
          then 'Repair the reward invariant or ledger issue, then retry continuation. Core sporting state is already validated and must not be rerun manually.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 8,
      'key', 'communications',
      'title', 'Dispatch season communications',
      'description', 'Send season-start, movement and contract-expiry communications with idempotent event keys.',
      'status', case
        when v_comms_done then 'done'
        when v_pair_run_found and v_run.status = 'communication_pending' and v_run.error_message is not null then 'blocked'
        when v_pair_run_found and v_run.status in ('rewards_applied','communication_pending') then 'running'
        else 'waiting'
      end,
      'detail', case
        when v_comms_done then 'Post-transition communications completed.'
        else 'Communication failure never rolls back successful sporting state.'
      end,
      'problem', case
        when v_pair_run_found and v_run.status = 'communication_pending' and v_run.error_message is not null
          then v_run.error_message
        else null
      end,
      'remediation', case
        when v_pair_run_found and v_run.status = 'communication_pending' and v_run.error_message is not null
          then 'Fix the notification/inbox error and retry communications. Do not rerun the sporting transition.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 9,
      'key', 'final_validation',
      'title', 'Final invariant validation',
      'description', 'Recheck source snapshot, target fresh state, persistence guards, reward guard/grants and the completed transition bridge before declaring success.',
      'status', case
        when v_final_done then 'done'
        when v_pair_run_found and v_run.status = 'communication_done' and v_run.error_message is not null then 'blocked'
        when v_pair_run_found and v_run.status = 'communication_done' then 'running'
        else 'waiting'
      end,
      'detail', case
        when v_final_done then 'Final validation passed; transition is completed.'
        else 'Game remains paused until this check passes.'
      end,
      'problem', case
        when v_pair_run_found and v_run.status = 'communication_done' and v_run.error_message is not null
          then v_run.error_message
        else null
      end,
      'remediation', case
        when v_pair_run_found and v_run.status = 'communication_done' and v_run.error_message is not null
          then 'Repair only the failed final invariant, then retry finalization. Core/rewards/communications are already committed by design.'
        else 'No action required.'
      end
    ),
    jsonb_build_object(
      'order', 10,
      'key', 'resume',
      'title', 'Resume game at Jan 1',
      'description', 'Resume only after the transition is completed and the game is still exactly at target Jan 1.',
      'status', case
        when v_resumed then 'done'
        when v_final_done and coalesce(v_game.is_paused,false) then 'ready'
        when v_final_done and not coalesce(v_game.is_paused,false) then 'done'
        else 'waiting'
      end,
      'detail', case
        when v_resumed or (v_final_done and not coalesce(v_game.is_paused,false))
          then 'Game clock resumed after successful transition.'
        when v_final_done then 'Transition completed; resume is the final controlled action.'
        else 'Resume is forbidden before completion.'
      end,
      'problem', null,
      'remediation', 'Never unpause a failed or incomplete season transition.'
    ),
    jsonb_build_object(
      'order', 11,
      'key', 'jan1_daily_backlog',
      'title', 'Process Jan 1 daily automation',
      'description', 'The Jan 1 daily tick is intentionally queued during migration and processed by forward daily automation only after the transition boundary is safely handled.',
      'status', case
        when v_backlog is null then 'waiting'
        when v_backlog ->> 'status' = 'processed' then 'done'
        when nullif(v_backlog ->> 'last_error','') is not null then 'blocked'
        else 'waiting'
      end,
      'detail', case
        when v_backlog is null then 'Jan 1 backlog row does not exist yet.'
        when v_backlog ->> 'status' = 'processed' then 'Jan 1 daily automation processed successfully.'
        else format('Jan 1 daily automation status: %s.', coalesce(v_backlog ->> 'status','unknown'))
      end,
      'problem', nullif(v_backlog ->> 'last_error',''),
      'remediation', case
        when nullif(v_backlog ->> 'last_error','') is not null
          then 'Keep the backlog pending, fix the reported daily processor error and let the retry-safe forward automation process it again.'
        else 'No action required.'
      end
    )
  );

  v_problem_count := v_blocking_components;
  if v_wrong_pair_armed then
    v_problem_count := v_problem_count + 1;
  end if;
  if v_pair_run_found and (
    v_run.status = 'failed'
    or (v_run.status <> 'completed' and nullif(v_run.error_message,'') is not null)
  ) then
    v_problem_count := v_problem_count + 1;
  end if;
  if nullif(v_backlog ->> 'last_error','') is not null then
    v_problem_count := v_problem_count + 1;
  end if;

  v_overall_status := case
    when v_problem_count > 0 then 'needs_attention'
    when v_pair_run_found and v_run.status = 'completed' then 'completed'
    when v_pair_run_found then 'in_progress'
    when v_exact_pair_armed then 'armed'
    when v_blocking_components = 0 then 'ready'
    else 'blocked'
  end;

  return jsonb_build_object(
    'overall_status', v_overall_status,
    'problem_count', v_problem_count,
    'game', jsonb_build_object(
      'season', v_game.season_number,
      'month', v_game.month_number,
      'day', v_game.day_number,
      'hour', v_game.hour_number,
      'minute', v_game.minute_number,
      'paused', v_game.is_paused,
      'game_date', v_game_date,
      'game_timestamp', v_game_ts
    ),
    'pair', jsonb_build_object(
      'source_season', v_source,
      'target_season', v_target,
      'source_end_date', v_source_end,
      'target_start_date', v_target_start,
      'using_active_run_pair', v_active_run_found
    ),
    'timing_policy', jsonb_build_object(
      'trigger', 'exact_dec31_to_jan1_game_date_boundary',
      'automatic_controller', 'season_transition_boundary_controller_v2',
      'game_pauses_before_mutation', true,
      'target_boundary_time', 'Jan 1 00:00 game time',
      'fail_closed', true,
      'resume_only_after_completed', true,
      'jan1_daily_processing_deferred', true
    ),
    'readiness', v_readiness,
    'persistence', v_persistence,
    'control', case when v_control.id is null then null else to_jsonb(v_control) end,
    'run', case
      when not v_pair_run_found then null
      else jsonb_build_object(
        'id', v_run.id,
        'source_season', v_run.source_season,
        'target_season', v_run.target_season,
        'mode', v_run.mode,
        'status', v_run.status,
        'source_end_date', v_run.source_end_date,
        'target_start_date', v_run.target_start_date,
        'error_message', v_run.error_message,
        'created_at', v_run.created_at,
        'source_frozen_at', v_run.source_frozen_at,
        'core_applied_at', v_run.core_applied_at,
        'completed_at', v_run.completed_at,
        'updated_at', v_run.updated_at,
        'resumed_at', nullif(v_run.metadata ->> 'resumed_at',''),
        'core_report', v_run.core_report,
        'reward_report', v_run.reward_report,
        'communication_report', v_run.communication_report,
        'validation_report', v_run.validation_report
      )
    end,
    'checklist', v_checklist,
    'events', v_events,
    'jan1_backlog', v_backlog,
    'history', v_history,
    'lab_checkpoints', v_checkpoints
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_season_migration_problem_count_v1()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_readiness jsonb;
  v_count integer := 0;
  v_run public.season_transition_engine_runs_v2%rowtype;
  v_control public.season_transition_control_v1%rowtype;
  v_current_season integer;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  v_readiness := public.get_season_transition_preflight_v1();
  v_count := coalesce((v_readiness ->> 'blocking_components')::integer, 0);

  select *
  into v_run
  from public.season_transition_engine_runs_v2 r
  where r.mode = 'production'
    and r.status <> 'completed'
  order by r.created_at desc
  limit 1;

  if found and (
    v_run.status = 'failed'
    or nullif(v_run.error_message,'') is not null
  ) then
    v_count := v_count + 1;
  end if;

  v_current_season := public.get_current_season_number();

  select *
  into v_control
  from public.season_transition_control_v1
  where id = true;

  if found
     and coalesce(v_control.is_armed,false)
     and (
       v_control.armed_source_season is distinct from v_current_season
       or v_control.armed_target_season is distinct from v_current_season + 1
     )
  then
    v_count := v_count + 1;
  end if;

  if exists (
    select 1
    from public.game_daily_tick_backlog_v1 b
    where nullif(b.last_error,'') is not null
      and b.current_game_date >= public.get_game_date_for_season_start(v_current_season)
      and b.current_game_date <= public.get_current_game_date_date()
      and b.status <> 'processed'
  ) then
    v_count := v_count + 1;
  end if;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_apply_race_result_morale_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_delta integer := 0;
  v_before integer;
  v_after integer;
  v_status text := lower(coalesce(new.finish_status,''));
  v_is_national_championship boolean := false;
  v_participation_bonus integer := 0;
begin
  if v_status in ('dnf','abandoned','did_not_finish','otl') then
    v_delta := -1;
  elsif new.finish_rank=1 then
    v_delta := 3;
  elsif new.finish_rank between 2 and 3 then
    v_delta := 2;
  elsif new.finish_rank between 4 and 10 then
    v_delta := 1;
  else
    v_delta := 0;
  end if;

  select coalesce((r.metadata->>'national_championship')::boolean,false)
  into v_is_national_championship
  from public.races r
  where r.id=new.race_id;

  if coalesce(v_is_national_championship,false)
     and v_status in ('finished','ok','completed')
  then
    select coalesce(c.participation_morale_bonus,1)
    into v_participation_bonus
    from public.national_championship_config c
    where c.id=true;

    v_participation_bonus:=coalesce(v_participation_bonus,1);
    v_delta:=v_delta+v_participation_bonus;
  end if;

  if v_delta=0 then
    return new;
  end if;

  select coalesce(r.morale,50)
  into v_before
  from public.riders r
  where r.id=new.rider_id
  for update;

  if not found then
    return new;
  end if;

  v_after:=greatest(0,least(100,v_before+v_delta));

  update public.riders
  set
    morale=v_after,
    morale_updated_on=case
      when new.stage_date is null then morale_updated_on
      else greatest(coalesce(morale_updated_on,new.stage_date),new.stage_date)
    end
  where id=new.rider_id;

  update public.rider_race_development_events
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'result_morale_rule_version','race_result_morale_v2',
    'result_morale_delta',v_delta,
    'result_morale_before',v_before,
    'result_morale_after',v_after,
    'national_championship',coalesce(v_is_national_championship,false),
    'national_championship_participation_bonus',v_participation_bonus
  )
  where id=new.id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_plan_bonus_preview_v2(p_club_id uuid, p_staff_ids uuid[] DEFAULT '{}'::uuid[], p_asset_assignments jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_staff jsonb:='[]'::jsonb;
  v_live_staff jsonb:='[]'::jsonb;
begin
  v_base:=public.get_race_plan_bonus_preview_v1(
    p_club_id,
    coalesce(p_staff_ids,'{}'::uuid[]),
    coalesce(p_asset_assignments,'[]'::jsonb)
  );

  select coalesce(jsonb_agg(value),'[]'::jsonb)
  into v_staff
  from jsonb_array_elements(coalesce(v_base->'staff','[]'::jsonb))
  where coalesce(value->>'source_key','')
        not in('sport_director','u23_head_coach','nutritionist');

  with sport_directors as (
    select
      cs.id,cs.role_type,cs.staff_name,
      greatest(0,least(100,
        coalesce(cs.expertise,50)*.35+
        coalesce(cs.experience,50)*.15+
        coalesce(cs.potential,50)*.10+
        coalesce(cs.leadership,50)*.20+
        (coalesce(cs.efficiency,50)+public.team_policy_staff_quality_bonus_v1(p_club_id))*.15+
        coalesce(cs.loyalty,50)*.05
      )) as quality,
      public.get_staff_assignment_availability_factor(
        cs.id,public.get_current_game_date_date()
      ) as availability
    from public.club_staff cs
    where cs.club_id=p_club_id
      and cs.id=any(coalesce(p_staff_ids,'{}'::uuid[]))
      and cs.is_active=true
      and cs.role_type='sport_director'
  ),
  best_nutritionist as (
    select
      cs.id,cs.role_type,cs.staff_name,
      greatest(0,least(100,
        coalesce(cs.expertise,50)*.35+
        coalesce(cs.experience,50)*.10+
        coalesce(cs.potential,50)*.10+
        coalesce(cs.leadership,50)*.10+
        (coalesce(cs.efficiency,50)+public.team_policy_staff_quality_bonus_v1(p_club_id))*.25+
        coalesce(cs.loyalty,50)*.10
      )) as quality,
      public.get_staff_assignment_availability_factor(
        cs.id,public.get_current_game_date_date()
      ) as availability
    from public.club_staff cs
    where cs.club_id=p_club_id
      and cs.is_active=true
      and cs.role_type='nutritionist'
    order by quality desc,cs.id
    limit 1
  ),
  candidates as (
    select * from sport_directors
    union all
    select * from best_nutritionist
  ),
  rows as (
    select case
      when role_type='sport_director' then
        jsonb_build_object(
          'source_type','staff',
          'source_key','sport_director',
          'source_label','Sport Director: '||staff_name,
          'effects',jsonb_build_array(
            jsonb_build_object(
              'effect_key','tactical_support_pct',
              'label','Race tactics & execution',
              'value','+'||
                round(
                  greatest(0,least(8,(quality-35)*.12))
                  *greatest(0,least(1,availability)),
                  1
                )::text||'%'
            )
          )
        )
      when role_type='nutritionist' then
        jsonb_build_object(
          'source_type','staff',
          'source_key','nutritionist',
          'source_label','Nutritionist: '||staff_name,
          'effects',jsonb_build_array(
            jsonb_build_object(
              'effect_key','feeding_support_pct',
              'label','Race feeding support',
              'value','+'||round(
                greatest(0,least(3.5,(quality-35)*.055))
                *greatest(0,least(1,availability)),1
              )::text||'%'
            ),
            jsonb_build_object(
              'effect_key','hydration_support_bonus_pct',
              'label','Hydration / fatigue control',
              'value','+'||round(
                greatest(0,least(4,(quality-35)*.065))
                *greatest(0,least(1,availability)),1
              )::text||'%'
            ),
            jsonb_build_object(
              'effect_key','recovery_comfort_bonus_pct',
              'label','Post-stage nutrition recovery',
              'value','+'||round(
                greatest(0,least(4,(quality-35)*.065))
                *greatest(0,least(1,availability)),1
              )::text||'%'
            ),
            jsonb_build_object(
              'effect_key','minor_injury_risk_reduction_pct',
              'label','Health protection',
              'value','-'||round(
                greatest(0,least(2.5,(quality-35)*.040))
                *greatest(0,least(1,availability)),1
              )::text||'%'
            )
          )
        )
      else null
    end as row_json
    from candidates
  )
  select coalesce(
    jsonb_agg(row_json) filter(where row_json is not null),
    '[]'::jsonb
  )
  into v_live_staff
  from rows;

  return jsonb_set(
    coalesce(v_base,'{}'::jsonb),
    '{staff}',
    v_staff||v_live_staff,
    true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_u23_stage_plan_on_race_plan_submit_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage_id uuid;
  v_result jsonb;
begin
  if lower(coalesce(new.status,'')) not in
       ('submitted','locked','final','finalized','completed')
     or lower(coalesce(old.status,'')) in
       ('submitted','locked','final','finalized','completed')
  then
    return new;
  end if;

  if not exists (
    select 1
    from public.race_preparation_stage_plan_automation a
    where a.race_preparation_id=new.id
      and a.is_enabled=true
      and a.planner_role='u23_head_coach'
      and a.planner_staff_id is not null
  ) then
    return new;
  end if;

  select rsp.stage_id
  into v_stage_id
  from public.race_stage_plans rsp
  where rsp.race_preparation_id=new.id
    and rsp.status='draft'
    and rsp.locked_at is null
    and rsp.submitted_at is null
    and rsp.stage_id is not null
    and rsp.stage_date >= public.get_current_game_date_date()
  order by rsp.stage_number, rsp.stage_date, rsp.id
  limit 1;

  if v_stage_id is null then
    return new;
  end if;

  begin
    v_result := public.apply_u23_stage_plan_automation_v1(
      new.id,
      v_stage_id,
      'race_plan_submitted'
    );

    update public.race_preparation_stage_plan_automation
    set
      last_generation_status =
        coalesce(v_result->>'status','race_plan_submitted_processed'),
      last_generation_summary = coalesce(v_result,'{}'::jsonb),
      metadata = coalesce(metadata,'{}'::jsonb)
        || jsonb_build_object(
          'race_plan_submit_hook_installed', true,
          'last_race_plan_submit_hook_at', clock_timestamp()
        ),
      updated_at=now()
    where race_preparation_id=new.id;
  exception when others then
    update public.race_preparation_stage_plan_automation
    set
      last_generation_status='race_plan_submit_hook_error',
      last_generation_summary=jsonb_build_object(
        'status','error',
        'message',sqlerrm,
        'stage_id',v_stage_id
      ),
      metadata=coalesce(metadata,'{}'::jsonb)
        || jsonb_build_object(
          'race_plan_submit_hook_installed', true,
          'last_race_plan_submit_hook_at', clock_timestamp()
        ),
      updated_at=now()
    where race_preparation_id=new.id;
  end;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_mark_u23_submit_hook_installed_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.metadata :=
    coalesce(new.metadata,'{}'::jsonb)
    || jsonb_build_object('race_plan_submit_hook_installed', true);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_team_policy_rider_support_v1(p_game_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_date date:=coalesce(p_game_date,public.get_current_game_date_date());
  v_recovery_rows integer:=0;
  v_morale_rows integer:=0;
begin
  if v_date is null then
    return jsonb_build_object('success',false,'reason','game_date_unavailable');
  end if;

  with candidates as (
    select cr.rider_id,cr.club_id,
           coalesce(e.recovery_bonus,0)+coalesce(e.fatigue_reduction_bonus,0) as recovery_points
    from public.club_riders cr
    cross join lateral public.get_club_team_policy_live_effects_v1(cr.club_id) e
    where coalesce(e.recovery_bonus,0)+coalesce(e.fatigue_reduction_bonus,0)>0
  ),
  ins as (
    insert into public.team_policy_rider_effect_log_v1(
      rider_id,club_id,effect_date,effect_kind,effect_value
    )
    select rider_id,club_id,v_date,'recovery_fatigue',recovery_points
    from candidates
    on conflict do nothing
    returning rider_id,effect_value
  )
  update public.riders r
  set fatigue=greatest(0,coalesce(r.fatigue,0)-ins.effect_value)
  from ins
  where r.id=ins.rider_id;

  get diagnostics v_recovery_rows=row_count;

  if mod(extract(doy from v_date)::integer-1,7)=0 then
    with candidates as (
      select cr.rider_id,cr.club_id,least(4,greatest(0,coalesce(e.morale_delta,0))) as morale_points
      from public.club_riders cr
      cross join lateral public.get_club_team_policy_live_effects_v1(cr.club_id) e
      where coalesce(e.morale_delta,0)>0
    ),
    ins as (
      insert into public.team_policy_rider_effect_log_v1(
        rider_id,club_id,effect_date,effect_kind,effect_value
      )
      select rider_id,club_id,v_date,'morale',morale_points
      from candidates
      on conflict do nothing
      returning rider_id,effect_value
    )
    update public.riders r
    set morale=least(100,coalesce(r.morale,50)+ins.effect_value)
    from ins
    where r.id=ins.rider_id;

    get diagnostics v_morale_rows=row_count;
  end if;

  return jsonb_build_object(
    'success',true,
    'game_date',v_date,
    'recovery_riders',v_recovery_rows,
    'morale_riders',v_morale_rows
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_sync_team_policy_nonrecurring_costs_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_policy public.club_team_policies%rowtype;
  v_season integer;
  v_item record;
  v_scope_season integer;
  v_target bigint;
  v_paid bigint;
  v_delta bigint;
  v_tx uuid;
  v_results jsonb:='[]'::jsonb;
begin
  select season_number into v_season from public.game_state where id=true;
  select * into v_policy from public.club_team_policies where club_id=p_club_id;
  if not found then
    return jsonb_build_object('success',true,'club_id',p_club_id,'skipped',true,'reason','no_policy_row');
  end if;

  for v_item in
    select *
    from (
      values
        ('staff_equipment_level'::text, v_policy.staff_equipment_level::text, 'one_time'::text),
        ('rider_bonus_plan'::text, v_policy.rider_bonus_plan::text, 'seasonal'::text),
        ('staff_bonus_plan'::text, v_policy.staff_bonus_plan::text, 'seasonal'::text)
    ) x(policy_key,option_code,expected_cost_type)
  loop
    select coalesce(c.base_cost,0)::bigint
    into v_target
    from public.team_policy_option_catalog c
    where c.policy_key=v_item.policy_key
      and c.option_code=v_item.option_code
      and c.is_active=true
      and c.cost_type=v_item.expected_cost_type
    limit 1;

    v_target:=coalesce(v_target,0);
    v_scope_season:=case when v_item.expected_cost_type='one_time' then 0 else coalesce(v_season,1) end;

    select charged_amount into v_paid
    from public.team_policy_nonrecurring_charge_state_v1 s
    where s.club_id=p_club_id
      and s.policy_key=v_item.policy_key
      and s.season_number=v_scope_season
    for update;

    v_paid:=coalesce(v_paid,0);
    v_delta:=greatest(0,v_target-v_paid);

    if v_delta>0 then
      v_tx:=public.finance_spend_from_club(
        p_club_id,
        v_delta,
        case
          when v_item.expected_cost_type='one_time' then 'team_policy_one_time_cost'
          else 'team_policy_seasonal_cost'
        end,
        'SINK',
        format('team_policy_nonrecurring:%s:%s:%s:%s',p_club_id,v_item.policy_key,v_scope_season,v_target),
        jsonb_build_object(
          'source','team_policies',
          'policy_key',v_item.policy_key,
          'option_code',v_item.option_code,
          'cost_type',v_item.expected_cost_type,
          'season_number',v_scope_season,
          'charged_before',v_paid,
          'target_cost',v_target,
          'delta_charged',v_delta
        )
      );
    else
      v_tx:=null;
    end if;

    insert into public.team_policy_nonrecurring_charge_state_v1(
      club_id,policy_key,season_number,charged_amount,updated_at
    )
    values(p_club_id,v_item.policy_key,v_scope_season,greatest(v_paid,v_target),now())
    on conflict(club_id,policy_key,season_number) do update
    set charged_amount=greatest(public.team_policy_nonrecurring_charge_state_v1.charged_amount,excluded.charged_amount),
        updated_at=now();

    v_results:=v_results||jsonb_build_array(jsonb_build_object(
      'policy_key',v_item.policy_key,
      'option_code',v_item.option_code,
      'cost_type',v_item.expected_cost_type,
      'season_number',v_scope_season,
      'target_cost',v_target,
      'previously_charged',v_paid,
      'delta_charged',v_delta,
      'transaction_id',v_tx
    ));
  end loop;

  return jsonb_build_object('success',true,'club_id',p_club_id,'season_number',v_season,'charges',v_results);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_process_team_policy_nonrecurring_costs_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  c record;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_ok integer:=0;
  v_failed integer:=0;
begin
  for c in
    select p.club_id
    from public.club_team_policies p
    join public.clubs cl on cl.id=p.club_id
    where cl.deleted_at is null
  loop
    begin
      v_result:=public.finance_sync_team_policy_nonrecurring_costs_v1(c.club_id);
      v_ok:=v_ok+1;
      v_results:=v_results||jsonb_build_array(v_result);
    exception when others then
      v_failed:=v_failed+1;
      v_results:=v_results||jsonb_build_array(jsonb_build_object(
        'success',false,'club_id',c.club_id,'error',sqlerrm
      ));
    end;
  end loop;
  return jsonb_build_object('success',v_failed=0,'processed',v_ok,'failed',v_failed,'results',v_results);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.queue_system_incident_email_v1(p_incident_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  i public.system_incidents%rowtype;
  p public.system_monitor_processes%rowtype;
  cfg public.system_health_config_v1%rowtype;
  v_subject text; v_text text; v_html text; v_count integer:=0; v_email text;
begin
  select * into i from public.system_incidents where id=p_incident_id;
  if not found then return 0; end if;
  select * into p from public.system_monitor_processes where process_key=i.process_key;
  if not found or not p.email_alerts_enabled then return 0; end if;
  select * into cfg from public.system_health_config_v1 where id=true;
  if not coalesce(cfg.email_enabled,true) then return 0; end if;

  v_subject:=format('[ProPeloton Manager] %s system incident: %s',upper(i.severity),i.title);
  v_text:=format(E'ProPeloton Manager detected a system problem.\n\nSeverity: %s\nProcess: %s\nCategory: %s\nFirst seen: %s\nLast seen: %s\n\n%s\n\nOpen Administration → System Health for diagnostics.',
    upper(i.severity),p.label,p.category,i.first_seen_at,i.last_seen_at,i.message);
  v_html:=format('<div style="font-family:Arial,sans-serif;color:#111827"><h2>ProPeloton Manager system incident</h2><p><strong>Severity:</strong> %s<br><strong>Process:</strong> %s<br><strong>Category:</strong> %s<br><strong>First seen:</strong> %s<br><strong>Last seen:</strong> %s</p><p>%s</p><p>Open <strong>Administration → System Health</strong> for diagnostics.</p></div>',
    upper(i.severity),p.label,p.category,i.first_seen_at,i.last_seen_at,replace(replace(i.message,'&','&amp;'),'<','&lt;'));

  for v_email in
    select distinct x.email from (
      select nullif(trim(a.email),'') email from public.app_admins a where a.is_active=true
      union all
      select nullif(trim(cfg.alert_email),'')
    ) x where x.email is not null
  loop
    insert into public.system_alert_email_outbox(incident_id,recipient_email,subject,text_body,html_body)
    values(i.id,v_email,v_subject,v_text,v_html);
    v_count:=v_count+1;
  end loop;

  update public.system_incidents set last_emailed_at=now(),updated_at=now() where id=i.id;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.raise_system_incident_v1(p_process_key text, p_severity text, p_title text, p_message text, p_dedupe_key text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid; v_last_email timestamptz; v_old_severity text;
  v_severity text:=lower(coalesce(p_severity,'high')); v_email boolean:=false;
begin
  if v_severity not in ('warning','high','critical') then v_severity:='high'; end if;
  select id,last_emailed_at,severity into v_id,v_last_email,v_old_severity
  from public.system_incidents
  where dedupe_key=p_dedupe_key and status in ('open','acknowledged')
  order by created_at desc limit 1 for update;

  if v_id is null then
    insert into public.system_incidents(process_key,severity,status,title,message,dedupe_key,details)
    values(p_process_key,v_severity,'open',p_title,p_message,p_dedupe_key,coalesce(p_details,'{}'))
    returning id into v_id;
    v_email:=true;
  else
    update public.system_incidents
    set severity=case when severity='critical' then severity when severity='high' and v_severity='warning' then severity else v_severity end,
        title=p_title,message=p_message,details=coalesce(p_details,'{}'),last_seen_at=now(),
        occurrence_count=occurrence_count+1,updated_at=now()
    where id=v_id;
    v_email:=v_last_email is null
      or v_last_email<now()-interval '6 hours'
      or (v_old_severity='warning' and v_severity in ('high','critical'))
      or (v_old_severity='high' and v_severity='critical');
  end if;
  if v_email then perform public.queue_system_incident_email_v1(v_id); end if;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_system_incident_by_dedupe_v1(p_dedupe_key text, p_note text DEFAULT 'Recovered automatically.'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ids uuid[];
  v_count integer;
begin
  select coalesce(array_agg(id),'{}'::uuid[])
  into v_ids
  from public.system_incidents
  where dedupe_key=p_dedupe_key
    and status in ('open','acknowledged');

  update public.system_incidents
  set status='resolved',
      resolved_at=coalesce(resolved_at,now()),
      resolution_note=coalesce(nullif(p_note,''),'Recovered automatically.'),
      updated_at=now()
  where id=any(v_ids);

  get diagnostics v_count=row_count;

  update public.system_alert_email_outbox
  set status='cancelled',
      last_error='Incident resolved before email dispatch.',
      updated_at=now()
  where incident_id=any(v_ids)
    and status in ('pending','failed');

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_system_cron_runs_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare
  proc record;
  v_latest record;
  v_previous record;
  v_dedupe_key text;
  v_restart_grace_minutes integer;
  v_is_restart_failure boolean;
  v_inserted integer:=0;
  v_updated integer:=0;
begin
  with src as (
    select
      smp.process_key,
      d.runid,
      d.status as cron_status,
      d.return_message,
      d.start_time,
      d.end_time,
      (
        d.status not in ('succeeded','running')
        and lower(trim(coalesce(d.return_message,'')))='server restarted'
      ) as is_restart_failure
    from cron.job_run_details d
    join cron.job j on j.jobid=d.jobid
    join public.system_monitor_processes smp
      on smp.source_kind='cron'
     and smp.is_enabled
     and smp.source_ref=j.jobname
    where d.start_time is not null
      and d.start_time>=now()-interval '6 hours'
  )
  insert into public.system_monitor_runs(
    process_key,source_run_id,status,started_at,finished_at,duration_ms,
    summary,error_message,details
  )
  select
    s.process_key,
    s.runid,
    case
      when s.cron_status='succeeded' then 'success'
      when s.cron_status='running' then 'running'
      when s.is_restart_failure then 'warning'
      else 'error'
    end,
    s.start_time,
    s.end_time,
    case
      when s.end_time is not null
        then greatest(0,(extract(epoch from(s.end_time-s.start_time))*1000)::bigint)
      else null
    end,
    case
      when s.cron_status='succeeded' then coalesce(nullif(s.return_message,''),'Completed')
      when s.cron_status='running' then 'Scheduled process is running.'
      when s.is_restart_failure then 'Transient database restart interrupted this run; awaiting automatic retry.'
      else 'Scheduled process failed.'
    end,
    case
      when s.cron_status in ('succeeded','running') then null
      when s.is_restart_failure then 'Database restart interrupted this run.'
      else coalesce(s.return_message,'Unknown pg_cron failure')
    end,
    jsonb_build_object(
      'cron_status',s.cron_status,
      'return_message',s.return_message,
      'transient_database_restart',s.is_restart_failure
    )
  from src s
  on conflict(process_key,source_run_id)
    where source_run_id is not null
  do nothing;

  get diagnostics v_inserted=row_count;

  with src as (
    select
      smp.process_key,
      d.runid,
      d.status as cron_status,
      d.return_message,
      d.start_time,
      d.end_time,
      (
        d.status not in ('succeeded','running')
        and lower(trim(coalesce(d.return_message,'')))='server restarted'
      ) as is_restart_failure
    from cron.job_run_details d
    join cron.job j on j.jobid=d.jobid
    join public.system_monitor_processes smp
      on smp.source_kind='cron'
     and smp.is_enabled
     and smp.source_ref=j.jobname
    where d.start_time is not null
      and d.start_time>=now()-interval '6 hours'
  ),
  normalized as (
    select
      s.*,
      case
        when s.cron_status='succeeded' then 'success'
        when s.cron_status='running' then 'running'
        when s.is_restart_failure then 'warning'
        else 'error'
      end as normalized_status,
      case
        when s.cron_status='succeeded' then coalesce(nullif(s.return_message,''),'Completed')
        when s.cron_status='running' then 'Scheduled process is running.'
        when s.is_restart_failure then 'Transient database restart interrupted this run; awaiting automatic retry.'
        else 'Scheduled process failed.'
      end as normalized_summary,
      case
        when s.cron_status in ('succeeded','running') then null
        when s.is_restart_failure then 'Database restart interrupted this run.'
        else coalesce(s.return_message,'Unknown pg_cron failure')
      end as normalized_error,
      case
        when s.end_time is not null
          then greatest(0,(extract(epoch from(s.end_time-s.start_time))*1000)::bigint)
        else null
      end as normalized_duration,
      jsonb_build_object(
        'cron_status',s.cron_status,
        'return_message',s.return_message,
        'transient_database_restart',s.is_restart_failure
      ) as normalized_details
    from src s
  )
  update public.system_monitor_runs r
  set
    status=n.normalized_status,
    started_at=n.start_time,
    finished_at=n.end_time,
    duration_ms=n.normalized_duration,
    summary=n.normalized_summary,
    error_message=n.normalized_error,
    details=n.normalized_details
  from normalized n
  where r.process_key=n.process_key
    and r.source_run_id=n.runid
    and (
      r.status is distinct from n.normalized_status
      or r.finished_at is distinct from n.end_time
      or r.duration_ms is distinct from n.normalized_duration
      or r.summary is distinct from n.normalized_summary
      or r.error_message is distinct from n.normalized_error
      or r.details is distinct from n.normalized_details
    );

  get diagnostics v_updated=row_count;

  for proc in
    select *
    from public.system_monitor_processes
    where is_enabled
      and source_kind='cron'
  loop
    v_latest:=null;
    v_previous:=null;
    v_dedupe_key:='cron-failure:'||proc.source_ref;

    select d.runid,d.status,d.return_message,d.start_time,d.end_time
    into v_latest
    from cron.job_run_details d
    join cron.job j on j.jobid=d.jobid
    where j.jobname=proc.source_ref
      and d.start_time is not null
    order by d.start_time desc nulls last
    limit 1;

    if v_latest is null or v_latest.runid is null then
      continue;
    end if;

    if v_latest.status not in ('succeeded','running') then
      v_is_restart_failure :=
        lower(trim(coalesce(v_latest.return_message,'')))='server restarted';

      if v_is_restart_failure then
        select d.runid,d.status,d.return_message,d.start_time,d.end_time
        into v_previous
        from cron.job_run_details d
        join cron.job j on j.jobid=d.jobid
        where j.jobname=proc.source_ref
          and d.start_time is not null
          and d.start_time < v_latest.start_time
        order by d.start_time desc nulls last
        limit 1;

        v_restart_grace_minutes := greatest(
          10,
          least(coalesce(proc.expected_interval_minutes,5) + 5, 30)
        );

        if coalesce(v_previous.status,'')='succeeded'
           and now() < v_latest.start_time + make_interval(mins=>v_restart_grace_minutes)
        then
          continue;
        end if;
      end if;

      if exists(
        select 1
        from public.system_incidents i
        where i.dedupe_key=v_dedupe_key
          and (i.details->>'run_id')=v_latest.runid::text
          and i.status in ('open','acknowledged','resolved')
      ) then
        continue;
      end if;

      perform public.raise_system_incident_v1(
        proc.process_key,
        proc.incident_severity,
        case
          when v_is_restart_failure then 'Scheduled process interrupted by database restart'
          else 'Scheduled process failed'
        end,
        case
          when v_is_restart_failure then format(
            '%s was interrupted at %s because the database restarted. Automatic retry did not recover within the expected grace period.',
            proc.source_ref,
            v_latest.start_time
          )
          else format(
            '%s failed at %s. %s',
            proc.source_ref,
            v_latest.start_time,
            coalesce(v_latest.return_message,'No return message.')
          )
        end,
        v_dedupe_key,
        jsonb_build_object(
          'job_name',proc.source_ref,
          'run_id',v_latest.runid,
          'return_message',v_latest.return_message,
          'started_at',v_latest.start_time,
          'transient_database_restart',v_is_restart_failure
        )
      );
    else
      perform public.resolve_system_incident_by_dedupe_v1(
        v_dedupe_key,
        'The latest scheduled run completed successfully.'
      );
    end if;
  end loop;

  return v_inserted+v_updated;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.log_system_business_check_v1(p_key text, p_status text, p_summary text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s timestamptz:=clock_timestamp();
begin
  insert into public.system_monitor_runs(process_key,status,started_at,finished_at,duration_ms,summary,details)
  values(p_key,p_status,s,clock_timestamp(),greatest(0,(extract(epoch from(clock_timestamp()-s))*1000)::bigint),p_summary,coalesce(p_details,'{}'));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_system_health_watchdog_base_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare
  s timestamptz:=clock_timestamp(); p record; latest timestamptz; n integer; issues integer:=0; synced integer:=0;
  game_day date:=public.get_current_game_date_date(); game_ts timestamp:=public.get_current_game_timestamp();
  cfg record; details jsonb;
begin
  synced:=public.sync_system_cron_runs_v1();

  for p in select * from public.system_monitor_processes where is_enabled and source_kind='cron'
  loop
    if not exists(select 1 from cron.job j where j.jobname=p.source_ref and j.active) then
      perform public.raise_system_incident_v1(p.process_key,p.incident_severity,'Scheduled job missing or disabled',
        format('Required pg_cron job "%s" is missing or disabled.',p.source_ref),'cron-disabled:'||p.source_ref,
        jsonb_build_object('job_name',p.source_ref));
      issues:=issues+1; continue;
    else
      perform public.resolve_system_incident_by_dedupe_v1('cron-disabled:'||p.source_ref,'The scheduled job is active again.');
    end if;

    if p.stale_after_minutes is not null then
      select max(d.start_time) into latest
      from cron.job_run_details d join cron.job j on j.jobid=d.jobid
      where j.jobname=p.source_ref;
      if (latest is null and now()>p.created_at+(p.stale_after_minutes||' minutes')::interval) or (latest is not null and latest<now()-(p.stale_after_minutes||' minutes')::interval) then
        perform public.raise_system_incident_v1(p.process_key,p.incident_severity,'Scheduled process is overdue',
          format('No run of "%s" has started within the expected %s-minute health window.',p.label,p.stale_after_minutes),
          'cron-stale:'||p.source_ref,jsonb_build_object('job_name',p.source_ref,'last_run_at',latest));
        issues:=issues+1;
      else
        perform public.resolve_system_incident_by_dedupe_v1('cron-stale:'||p.source_ref,'Scheduler cadence is healthy.');
      end if;
    end if;
  end loop;


  select count(*) into n from public.club_sponsor_objectives o
  where o.status='active' and o.objective_result_state='pending'
    and o.target_check_game_date is not null and o.target_check_game_date<game_day;
  perform public.log_system_business_check_v1('check:sponsor_objectives',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s sponsor objective(s) overdue for evaluation.',n) else 'Sponsor objective processing is current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:sponsor_objectives','high','Sponsor objectives are overdue',
    format('%s sponsor objective(s) remain pending past their check date.',n),'business:sponsor-objectives',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:sponsor-objectives','Sponsor objective processing is current.'); end if;

  select count(*) into n from public.rider_scout_tasks
  where status in ('queued','in_progress') and completes_at_game_ts<game_ts-interval '1 hour';
  perform public.log_system_business_check_v1('check:scouting_tasks',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s scouting task(s) overdue.',n) else 'Scouting task completion is current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:scouting_tasks','high','Scouting tasks are overdue',
    format('%s scouting task(s) are still open after their completion time.',n),'business:scouting-tasks',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:scouting-tasks','Scouting tasks are current.'); end if;

  select count(*) into n from public.club_infrastructure_jobs
  where status in ('queued','in_progress','active') and complete_game_date<game_day;
  perform public.log_system_business_check_v1('check:infrastructure_jobs',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s infrastructure job(s) overdue.',n) else 'Infrastructure jobs are current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:infrastructure_jobs','high','Infrastructure jobs are overdue',
    format('%s infrastructure job(s) remain open after their completion date.',n),'business:infrastructure-jobs',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:infrastructure-jobs','Infrastructure jobs are current.'); end if;

  select count(*) into n from public.club_equipment_maintenance_jobs
  where status in ('queued','in_progress','active') and complete_game_date<game_day;
  perform public.log_system_business_check_v1('check:equipment_jobs',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s equipment maintenance job(s) overdue.',n) else 'Equipment maintenance jobs are current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:equipment_jobs','high','Equipment maintenance is overdue',
    format('%s equipment maintenance job(s) remain open after their completion date.',n),'business:equipment-jobs',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:equipment-jobs','Equipment maintenance is current.'); end if;

  select count(*) into n from public.club_infrastructure_asset_repair_jobs
  where status in ('queued','in_progress','active') and complete_game_date<game_day;
  perform public.log_system_business_check_v1('check:asset_repairs',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s infrastructure asset repair(s) overdue.',n) else 'Infrastructure asset repair jobs are current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:asset_repairs','high','Infrastructure asset repairs are overdue',
    format('%s repair job(s) remain open after their completion date.',n),'business:asset-repairs',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:asset-repairs','Infrastructure asset repairs are current.'); end if;

  select count(*) into n from public.staff_courses
  where status='active' and completes_on_game_date<game_day;
  perform public.log_system_business_check_v1('check:staff_courses',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s staff course(s) overdue.',n) else 'Staff course completion is current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:staff_courses','high','Staff courses are overdue',
    format('%s active staff course(s) remain open after their completion date.',n),'business:staff-courses',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:staff-courses','Staff courses are current.'); end if;

  select count(*) into n from public.rider_transfer_negotiations
  where status='open' and expires_on_game_date<game_day;
  perform public.log_system_business_check_v1('check:transfer_negotiations',case when n>0 then 'warning' else 'success' end,
    case when n>0 then format('%s transfer negotiation(s) expired but still open.',n) else 'Transfer negotiation expiry state is current.' end,jsonb_build_object('count',n));
  if n>0 then perform public.raise_system_incident_v1('check:transfer_negotiations','high','Expired transfer negotiations remain open',
    format('%s transfer negotiation(s) should already be terminal.',n),'business:transfer-negotiations',jsonb_build_object('count',n)); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:transfer-negotiations','Transfer negotiation expiry state is current.'); end if;

  select gc.speed_multiplier,gc.base_real_at,gc.base_game_at,gc.is_paused,gs.last_advanced_at,gs.is_paused state_paused
  into cfg
  from public.game_clock_config gc cross join public.game_state gs
  where gc.id=true and gs.id=true;
  details:=jsonb_build_object('speed_multiplier',cfg.speed_multiplier,'base_real_at',cfg.base_real_at,'base_game_at',cfg.base_game_at,
    'clock_paused',cfg.is_paused,'state_paused',cfg.state_paused,'last_advanced_at',cfg.last_advanced_at);
  n:=case when cfg.speed_multiplier is null or cfg.speed_multiplier<=0 or cfg.base_real_at>now()+interval '5 minutes' then 1 else 0 end;
  perform public.log_system_business_check_v1('check:game_clock',case when n>0 then 'error' else 'success' end,
    case when n>0 then 'Game clock configuration is invalid.' else 'Game clock configuration is valid.' end,details);
  if n>0 then perform public.raise_system_incident_v1('check:game_clock','critical','Game clock configuration is invalid',
    'The game clock has an invalid speed or a future real-time anchor.','business:game-clock',details); issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:game-clock','Game clock configuration is valid.'); end if;

  select count(*) into n from public.system_alert_email_outbox
  where (status='failed' and attempts>=3) or (status='sending' and last_attempt_at<now()-interval '20 minutes');
  perform public.log_system_business_check_v1('check:admin_alert_email',case when n>0 then 'error' else 'success' end,
    case when n>0 then format('%s administrator alert email job(s) repeatedly failing/stuck.',n) else 'Administrator alert email channel is healthy.' end,jsonb_build_object('count',n));
  if n>0 then
    perform public.raise_system_incident_v1('check:admin_alert_email','critical','Administrator alert email channel is failing',
      format('%s system-health alert email job(s) are repeatedly failing or stuck.',n),'business:admin-alert-email',jsonb_build_object('count',n));
    issues:=issues+1;
  else perform public.resolve_system_incident_by_dedupe_v1('business:admin-alert-email','Administrator alert email channel is healthy.'); end if;

  insert into public.system_monitor_runs(process_key,status,started_at,finished_at,duration_ms,summary,details)
  values('watchdog:system-health',case when issues>0 then 'warning' else 'success' end,s,clock_timestamp(),
    greatest(0,(extract(epoch from(clock_timestamp()-s))*1000)::bigint),
    format('Watchdog completed: %s cron runs synchronized, %s active issue(s).',synced,issues),
    jsonb_build_object('cron_runs_synced',synced,'issues',issues,'game_date',game_day,'game_timestamp',game_ts));
  perform public.resolve_system_incident_by_dedupe_v1('watchdog:self-failure','System health watchdog completed successfully.');
  return jsonb_build_object('status','completed','cron_runs_synced',synced,'active_checks_failed',issues);
exception when others then
  perform public.raise_system_incident_v1('watchdog:system-health','critical','System health watchdog failed',sqlerrm,
    'watchdog:self-failure',jsonb_build_object('sqlstate',sqlstate));
  insert into public.system_monitor_runs(process_key,status,started_at,finished_at,duration_ms,summary,error_message)
  values('watchdog:system-health','error',s,clock_timestamp(),
    greatest(0,(extract(epoch from(clock_timestamp()-s))*1000)::bigint),'System health watchdog failed.',sqlerrm);
  return jsonb_build_object('status','error','error',sqlerrm);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_system_health_overview_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_app_admin_v1() then raise exception 'Administrator access required' using errcode='42501'; end if;
 with pr as (
   select p.*,lr.status latest_status,lr.started_at latest_started_at,lr.finished_at latest_finished_at,
     lr.duration_ms latest_duration_ms,lr.summary latest_summary,lr.error_message latest_error_message,
     cj.active cron_active,
     (select count(*)::int from public.system_incidents i where i.process_key=p.process_key and i.status in ('open','acknowledged')) open_incidents
   from public.system_monitor_processes p
   left join lateral(select * from public.system_monitor_runs r where r.process_key=p.process_key order by r.started_at desc limit 1) lr on true
   left join cron.job cj on p.source_kind='cron' and cj.jobname=p.source_ref
   where p.is_enabled
 )
 select jsonb_build_object(
   'summary',jsonb_build_object(
     'open_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged')),
     'critical_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged') and severity='critical'),
     'high_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged') and severity='high'),
     'warning_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged') and severity='warning'),
     'monitored_processes',(select count(*) from public.system_monitor_processes where is_enabled),
     'user_sensitive_processes',(select count(*) from public.system_monitor_processes where is_enabled and user_sensitive),
     'alert_email',(select alert_email from public.system_health_config_v1 where id=true)
   ),
   'processes',coalesce((select jsonb_agg(jsonb_build_object(
     'process_key',process_key,'label',label,'category',category,'description',description,'source_kind',source_kind,'source_ref',source_ref,
     'user_sensitive',user_sensitive,'incident_severity',incident_severity,'expected_interval_minutes',expected_interval_minutes,
     'stale_after_minutes',stale_after_minutes,'latest_status',latest_status,'latest_started_at',latest_started_at,
     'latest_finished_at',latest_finished_at,'latest_duration_ms',latest_duration_ms,'latest_summary',latest_summary,
     'latest_error_message',latest_error_message,'cron_active',cron_active,'open_incidents',open_incidents
   ) order by sort_order,label) from pr),'[]'::jsonb),
   'incidents',coalesce((select jsonb_agg(jsonb_build_object(
     'id',i.id,'process_key',i.process_key,'process_label',p.label,'category',p.category,'severity',i.severity,'status',i.status,
     'title',i.title,'message',i.message,'details',i.details,'first_seen_at',i.first_seen_at,'last_seen_at',i.last_seen_at,
     'occurrence_count',i.occurrence_count,'last_emailed_at',i.last_emailed_at,'acknowledged_at',i.acknowledged_at,
     'resolved_at',i.resolved_at,'resolution_note',i.resolution_note,
     'is_unread',not exists(select 1 from public.system_incident_admin_reads rr where rr.incident_id=i.id and rr.admin_user_id=auth.uid())
   ) order by case i.severity when 'critical' then 1 when 'high' then 2 else 3 end,i.last_seen_at desc)
   from public.system_incidents i join public.system_monitor_processes p on p.process_key=i.process_key
   where i.status in ('open','acknowledged')),'[]'::jsonb)
 ) into result;
 return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_system_incidents_v1(p_status text DEFAULT 'active'::text, p_limit integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result jsonb;
  s text:=lower(coalesce(p_status,'active'));
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',x.id,
        'process_key',x.process_key,
        'process_label',x.label,
        'category',x.category,
        'severity',x.severity,
        'status',x.status,
        'title',x.title,
        'message',x.message,
        'details',x.details,
        'first_seen_at',x.first_seen_at,
        'last_seen_at',x.last_seen_at,
        'occurrence_count',x.occurrence_count,
        'last_emailed_at',x.last_emailed_at,
        'acknowledged_at',x.acknowledged_at,
        'resolved_at',x.resolved_at,
        'resolution_note',x.resolution_note,
        'is_unread',not exists(
          select 1
          from public.system_incident_admin_reads rr
          where rr.incident_id=x.id
            and rr.admin_user_id=auth.uid()
        )
      )
      order by x.last_seen_at desc
    ),
    '[]'::jsonb
  )
  into result
  from (
    select i.*,p.label,p.category
    from public.system_incidents i
    join public.system_monitor_processes p
      on p.process_key=i.process_key
    where p.is_enabled
      and (
        s='all'
        or (s='active' and i.status in ('open','acknowledged'))
        or (s='resolved' and i.status='resolved')
      )
    order by i.last_seen_at desc
    limit greatest(1,least(coalesce(p_limit,300),1000))
  ) x;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_system_runs_v1(p_process_key text DEFAULT NULL::text, p_limit integer DEFAULT 400)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.is_app_admin_v1() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',x.id,
        'process_key',x.process_key,
        'process_label',x.label,
        'category',x.category,
        'status',x.status,
        'started_at',x.started_at,
        'finished_at',x.finished_at,
        'duration_ms',x.duration_ms,
        'summary',x.summary,
        'error_message',x.error_message,
        'details',x.details
      )
      order by x.started_at desc
    ),
    '[]'::jsonb
  )
  into result
  from (
    select r.*,p.label,p.category
    from public.system_monitor_runs r
    join public.system_monitor_processes p
      on p.process_key=r.process_key
    where p.is_enabled
      and (p_process_key is null or r.process_key=p_process_key)
    order by r.started_at desc
    limit greatest(1,least(coalesce(p_limit,400),1000))
  ) x;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_admin_system_incident_read_v1(p_incident_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if auth.uid() is null or not public.is_app_admin_v1() then raise exception 'Administrator access required' using errcode='42501'; end if;
 insert into public.system_incident_admin_reads(incident_id,admin_user_id,read_at)
 values(p_incident_id,auth.uid(),now())
 on conflict(incident_id,admin_user_id) do update set read_at=excluded.read_at;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_update_system_incident_v1(p_incident_id uuid, p_action text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a text:=lower(trim(coalesce(p_action,'')));
begin
 if auth.uid() is null or not public.is_app_admin_v1() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if a='acknowledge' then
   update public.system_incidents set status='acknowledged',acknowledged_at=now(),acknowledged_by=auth.uid(),updated_at=now()
   where id=p_incident_id and status='open';
 elsif a='resolve' then
   update public.system_incidents set status='resolved',resolved_at=now(),resolved_by=auth.uid(),
     resolution_note=coalesce(nullif(trim(p_note),''),'Resolved by administrator.'),updated_at=now()
   where id=p_incident_id and status in ('open','acknowledged');
 elsif a='reopen' then
   update public.system_incidents set status='open',resolved_at=null,resolved_by=null,resolution_note=null,updated_at=now()
   where id=p_incident_id and status='resolved';
 else raise exception 'Invalid incident action.'; end if;
 if not found then raise exception 'Incident not found or action is invalid for its current status.'; end if;
 perform public.mark_admin_system_incident_read_v1(p_incident_id);
 return jsonb_build_object('id',p_incident_id,'action',a);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_system_alert_email_outbox_v1(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare result jsonb;
begin
  with candidates as (
    select o.id
    from public.system_alert_email_outbox o
    join public.system_incidents i on i.id=o.incident_id
    where o.status in ('pending','failed')
      and o.next_attempt_at<=now()
      and o.attempts<10
      and i.status in ('open','acknowledged')
    order by o.created_at
    for update of o skip locked
    limit greatest(1,least(coalesce(p_limit,20),50))
  ), claimed as (
    update public.system_alert_email_outbox o
    set status='sending',
        attempts=o.attempts+1,
        last_attempt_at=now(),
        last_error=null,
        updated_at=now()
    from candidates c
    where o.id=c.id
    returning o.id,o.incident_id,o.recipient_email,o.subject,o.text_body,o.html_body,o.attempts
  )
  select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb)
  into result
  from claimed;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_reopen_replay_quarantine_after_engine_upgrade_v1(p_source_commit text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_commit text := nullif(btrim(coalesce(p_source_commit,'')), '');
  v_row record;
  v_reopened integer := 0;
  v_stage_ids uuid[] := array[]::uuid[];
  v_run_id uuid;
  v_previous_commit text;
begin
  if v_commit is null then
    return jsonb_build_object(
      'status','blocked',
      'reason','source_commit_required',
      'reopened',0
    );
  end if;

  /*
   * A deterministic replay-validation bug must not spin forever on the same
   * engine build. Quarantine remains fail-closed. The only automatic reopen is
   * after production is running a DIFFERENT engine commit, and only for a
   * replay-synchronization quarantine whose full sporting scenario was
   * preserved.
   *
   * One run is auto-reopened at most once per source commit. If the new build
   * still fails, normal retry/quarantine protection takes over again.
   */
  for v_row in
    select
      q.stage_id,
      q.details,
      q.quarantined_at
    from public.race_stage_calculation_quarantine_v1 q
    where q.reason = 'pass2_retry_exhausted_same_full_input'
      and coalesce(q.details->>'scenario_preserved','false')::boolean = true
      and coalesce(q.details->>'previous_error','')
            like 'Universal replay synchronization failed:%'
      and not exists (
        select 1
        from public.race_stage_authoritative_runs a
        where a.stage_id = q.stage_id
      )
    order by q.quarantined_at
    limit 5
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        'universal_race_replay_quarantine_upgrade:' || v_row.stage_id::text,
        0
      )
    );

    v_run_id := nullif(v_row.details->>'simulation_run_id','')::uuid;
    if v_run_id is null then
      continue;
    end if;

    select
      coalesce(
        s.result_summary_json #>> '{survival_details,source_commit}',
        s.result_summary_json #>> '{error_details,source_commit}',
        ''
      )
    into v_previous_commit
    from public.race_stage_simulation_runs s
    where s.id = v_run_id
      and s.stage_id = v_row.stage_id
      and s.status = 'failed';

    if not found then
      continue;
    end if;

    if v_previous_commit = v_commit then
      continue;
    end if;

    if exists (
      select 1
      from public.race_stage_simulation_runs s
      where s.id = v_run_id
        and coalesce(
          s.result_summary_json->>'last_auto_reopen_source_commit',
          ''
        ) = v_commit
    ) then
      continue;
    end if;

    update public.race_stage_simulation_runs s
       set status = 'failed',
           failed_at = clock_timestamp(),
           error_message = coalesce(
             nullif(v_row.details->>'previous_error',''),
             s.error_message
           ),
           result_summary_json =
             (
               coalesce(s.result_summary_json,'{}'::jsonb)
               - 'pass2_retry_exhausted_at_real'
             )
             || jsonb_build_object(
                  'survival_phase','pass2_resume_failed',
                  'pass2_attempt_count',0,
                  'calculation_status','failed',
                  'last_auto_reopen_source_commit',v_commit,
                  'auto_reopen_previous_source_commit',nullif(v_previous_commit,''),
                  'auto_reopen_reason','engine_build_changed_after_replay_sync_quarantine',
                  'auto_reopened_at_real',clock_timestamp(),
                  'recovery_policy','same_full_input_engine_upgrade_auto_reopen_v1'
                ),
           updated_at = clock_timestamp()
     where s.id = v_run_id
       and s.stage_id = v_row.stage_id;

    delete from public.race_stage_calculation_quarantine_v1 q
    where q.stage_id = v_row.stage_id
      and q.reason = 'pass2_retry_exhausted_same_full_input';

    insert into public.race_engine_calculation_survival_audit_v1(
      stage_id,
      race_id,
      simulation_run_id,
      action,
      reason,
      details
    )
    select
      s.stage_id,
      s.race_id,
      s.id,
      'auto_reopen_replay_quarantine',
      'engine_build_changed_after_replay_sync_quarantine',
      jsonb_build_object(
        'previous_source_commit',nullif(v_previous_commit,''),
        'new_source_commit',v_commit,
        'scenario_preserved',true,
        'retry_attempt_count_reset_to',0,
        'policy','same_full_input_engine_upgrade_auto_reopen_v1'
      )
    from public.race_stage_simulation_runs s
    where s.id = v_run_id;

    v_reopened := v_reopened + 1;
    v_stage_ids := array_append(v_stage_ids, v_row.stage_id);
  end loop;

  return jsonb_build_object(
    'status','completed',
    'source_commit',v_commit,
    'reopened',v_reopened,
    'stage_ids',to_jsonb(v_stage_ids),
    'policy','same_full_input_engine_upgrade_auto_reopen_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_enable_safe_mode_v1(p_stage_id uuid, p_simulation_run_id uuid, p_reason text, p_workload_score numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race_id uuid;
begin
  select r.race_id into v_race_id
  from public.race_stage_simulation_runs r
  where r.id=p_simulation_run_id
    and r.stage_id=p_stage_id
    and r.engine_version='race_engine_ts_v1'
    and r.simulation_mode='deterministic_road_race_v1'
  for update;

  if v_race_id is null then
    return jsonb_build_object('status','missing_run','stage_id',p_stage_id,'simulation_run_id',p_simulation_run_id);
  end if;

  if exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id) then
    return jsonb_build_object('status','already_authoritative','stage_id',p_stage_id,'simulation_run_id',p_simulation_run_id);
  end if;

  insert into public.race_stage_safe_calculation_v1(
    stage_id,race_id,simulation_run_id,status,step,workload_score,trigger_reason,
    checkpoint_json,lease_token,lease_expires_at,step_attempt_count,total_attempt_count,last_error,
    created_at,updated_at,completed_at
  )
  values(
    p_stage_id,v_race_id,p_simulation_run_id,'pending',0,coalesce(p_workload_score,0),
    coalesce(nullif(p_reason,''),'safe_mode_requested'),
    '{}'::jsonb,null,null,0,0,null,clock_timestamp(),clock_timestamp(),null
  )
  on conflict(stage_id) do update
    set race_id=excluded.race_id,
        simulation_run_id=excluded.simulation_run_id,
        status=case when public.race_stage_safe_calculation_v1.status='completed' then 'completed' else 'pending' end,
        workload_score=greatest(public.race_stage_safe_calculation_v1.workload_score,excluded.workload_score),
        trigger_reason=excluded.trigger_reason,
        lease_token=null,
        lease_expires_at=null,
        last_error=null,
        updated_at=clock_timestamp(),
        completed_at=case when public.race_stage_safe_calculation_v1.status='completed'
                          then public.race_stage_safe_calculation_v1.completed_at else null end;

  update public.race_stage_simulation_runs
     set status='running',
         failed_at=null,
         error_message=null,
         result_summary_json=coalesce(result_summary_json,'{}'::jsonb)
           || jsonb_build_object(
                'survival_phase','safe_mode_pending',
                'safe_mode_enabled',true,
                'safe_mode_reason',coalesce(nullif(p_reason,''),'safe_mode_requested'),
                'safe_mode_workload_score',coalesce(p_workload_score,0),
                'safe_mode_enabled_at_real',clock_timestamp(),
                'recovery_policy','checkpointed_safe_mode_v1'
              ),
         updated_at=clock_timestamp()
   where id=p_simulation_run_id and stage_id=p_stage_id;

  update public.race_stage_automation_state
     set last_status='running',
         last_error=null,
         last_checked_at=clock_timestamp(),
         details=coalesce(details,'{}'::jsonb)
           || jsonb_build_object(
                'survival_phase','safe_mode_pending',
                'safe_mode_enabled',true,
                'safe_mode_reason',coalesce(nullif(p_reason,''),'safe_mode_requested'),
                'safe_mode_workload_score',coalesce(p_workload_score,0),
                'recovery_policy','checkpointed_safe_mode_v1'
              ),
         updated_at=clock_timestamp()
   where stage_id=p_stage_id and simulation_run_id=p_simulation_run_id;

  delete from public.race_stage_calculation_quarantine_v1 where stage_id=p_stage_id;

  insert into public.race_engine_calculation_survival_audit_v1(
    stage_id,race_id,simulation_run_id,action,reason,details
  )
  values(
    p_stage_id,v_race_id,p_simulation_run_id,'enable_checkpointed_safe_mode',
    coalesce(nullif(p_reason,''),'safe_mode_requested'),
    jsonb_build_object(
      'workload_score',coalesce(p_workload_score,0),
      'model_version','checkpointed_safe_mode_v1'
    )
  );

  return jsonb_build_object(
    'status','safe_mode_enabled',
    'stage_id',p_stage_id,
    'simulation_run_id',p_simulation_run_id,
    'workload_score',coalesce(p_workload_score,0),
    'reason',coalesce(nullif(p_reason,''),'safe_mode_requested')
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_safe_step_v1(p_worker_id text DEFAULT 'safe_edge_v1'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_row public.race_stage_safe_calculation_v1%rowtype;
  v_token uuid := gen_random_uuid();
begin
  select *
    into v_row
  from public.race_stage_safe_calculation_v1 s
  where s.status in ('pending','running')
    and (s.lease_expires_at is null or s.lease_expires_at < clock_timestamp())
    and not exists (
      select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.stage_id
    )
  order by s.updated_at asc
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('status','idle');
  end if;

  update public.race_stage_safe_calculation_v1
     set status='running',
         lease_token=v_token,
         lease_expires_at=clock_timestamp()+interval '90 seconds',
         step_attempt_count=step_attempt_count+1,
         total_attempt_count=total_attempt_count+1,
         updated_at=clock_timestamp()
   where stage_id=v_row.stage_id;

  perform public.universal_race_stage_survival_heartbeat_v1(
    v_row.stage_id,
    v_row.simulation_run_id,
    'safe_mode_step_'||v_row.step::text,
    jsonb_build_object(
      'worker_id',coalesce(nullif(p_worker_id,''),'safe_edge_v1'),
      'step',v_row.step,
      'step_attempt_count',v_row.step_attempt_count+1,
      'total_attempt_count',v_row.total_attempt_count+1,
      'workload_score',v_row.workload_score,
      'model_version','checkpointed_safe_mode_v1'
    )
  );

  return jsonb_build_object(
    'status','claimed',
    'stage_id',v_row.stage_id,
    'race_id',v_row.race_id,
    'simulation_run_id',v_row.simulation_run_id,
    'step',v_row.step,
    'checkpoint',v_row.checkpoint_json,
    'lease_token',v_token,
    'step_attempt_count',v_row.step_attempt_count+1,
    'total_attempt_count',v_row.total_attempt_count+1,
    'workload_score',v_row.workload_score,
    'trigger_reason',v_row.trigger_reason
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_save_safe_step_v1(p_stage_id uuid, p_simulation_run_id uuid, p_lease_token uuid, p_next_step integer, p_checkpoint jsonb, p_phase text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_updated integer := 0;
begin
  update public.race_stage_safe_calculation_v1
     set step=greatest(0,p_next_step),
         checkpoint_json=coalesce(p_checkpoint,'{}'::jsonb),
         status='pending',
         lease_token=null,
         lease_expires_at=null,
         step_attempt_count=0,
         last_error=null,
         updated_at=clock_timestamp()
   where stage_id=p_stage_id
     and simulation_run_id=p_simulation_run_id
     and lease_token=p_lease_token
     and status='running';
  get diagnostics v_updated=row_count;

  if v_updated=0 then
    return jsonb_build_object('status','stale_lease');
  end if;

  perform public.universal_race_stage_survival_heartbeat_v1(
    p_stage_id,p_simulation_run_id,
    coalesce(nullif(p_phase,''),'safe_mode_step_saved_'||p_next_step::text),
    jsonb_build_object(
      'next_step',p_next_step,
      'model_version','checkpointed_safe_mode_v1'
    )
  );

  perform public.universal_race_stage_kick_safe_worker_v1();

  return jsonb_build_object('status','saved','next_step',p_next_step);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_fail_safe_step_v1(p_stage_id uuid, p_simulation_run_id uuid, p_lease_token uuid, p_error text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_attempt integer;
begin
  update public.race_stage_safe_calculation_v1
     set status='pending',
         lease_token=null,
         lease_expires_at=null,
         last_error=left(coalesce(p_error,'Unknown safe-step error'),10000),
         updated_at=clock_timestamp()
   where stage_id=p_stage_id
     and simulation_run_id=p_simulation_run_id
     and lease_token=p_lease_token
     and status='running'
  returning step_attempt_count into v_attempt;

  if v_attempt is null then
    return jsonb_build_object('status','stale_lease');
  end if;

  perform public.universal_race_stage_survival_heartbeat_v1(
    p_stage_id,p_simulation_run_id,'safe_mode_step_failed',
    jsonb_build_object(
      'error',left(coalesce(p_error,'Unknown safe-step error'),10000),
      'step_attempt_count',v_attempt,
      'model_version','checkpointed_safe_mode_v1'
    )
  );

  return jsonb_build_object('status','retry_pending','step_attempt_count',v_attempt);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_complete_safe_mode_v1(p_stage_id uuid, p_simulation_run_id uuid, p_lease_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_updated integer := 0;
begin
  update public.race_stage_safe_calculation_v1
     set status='completed',
         lease_token=null,
         lease_expires_at=null,
         checkpoint_json='{}'::jsonb,
         completed_at=clock_timestamp(),
         updated_at=clock_timestamp()
   where stage_id=p_stage_id
     and simulation_run_id=p_simulation_run_id
     and lease_token=p_lease_token
     and status='running';
  get diagnostics v_updated=row_count;

  if v_updated=0 then
    return jsonb_build_object('status','stale_lease');
  end if;

  return jsonb_build_object('status','completed');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_kick_safe_worker_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_request_id bigint;
begin
  select net.http_post(
    url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-safe-resume',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-universal-race-worker-secret',(
        select decrypted_secret
        from vault.decrypted_secrets
        where name='universal_race_worker_secret_v1'
        limit 1
      )
    ),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_request_id;

  return jsonb_build_object('status','queued','request_id',v_request_id);
exception when others then
  return jsonb_build_object('status','kick_failed','error',sqlerrm);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_safe_step_v2(p_worker_id text DEFAULT 'safe_edge_v2'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_row public.race_stage_safe_calculation_v1%rowtype;
  v_token uuid := gen_random_uuid();
begin
  select *
    into v_row
  from public.race_stage_safe_calculation_v1 s
  where s.status in ('pending','running')
    and (s.lease_expires_at is null or s.lease_expires_at < clock_timestamp())
    and not exists (
      select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.stage_id
    )
  order by s.updated_at asc
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('status','idle');
  end if;

  update public.race_stage_safe_calculation_v1
     set status='running',
         lease_token=v_token,
         lease_expires_at=clock_timestamp()+interval '90 seconds',
         step_attempt_count=step_attempt_count+1,
         total_attempt_count=total_attempt_count+1,
         updated_at=clock_timestamp()
   where stage_id=v_row.stage_id;

  perform public.universal_race_stage_survival_heartbeat_v1(
    v_row.stage_id,
    v_row.simulation_run_id,
    'safe_mode_step_'||v_row.step::text,
    jsonb_build_object(
      'worker_id',coalesce(nullif(p_worker_id,''),'safe_edge_v2'),
      'step',v_row.step,
      'step_attempt_count',v_row.step_attempt_count+1,
      'total_attempt_count',v_row.total_attempt_count+1,
      'workload_score',v_row.workload_score,
      'checkpoint_storage','ordered_json_text_v2',
      'model_version','checkpointed_safe_mode_v2'
    )
  );

  return jsonb_build_object(
    'status','claimed',
    'stage_id',v_row.stage_id,
    'race_id',v_row.race_id,
    'simulation_run_id',v_row.simulation_run_id,
    'step',v_row.step,
    'checkpoint_text',v_row.checkpoint_text,
    'lease_token',v_token,
    'step_attempt_count',v_row.step_attempt_count+1,
    'total_attempt_count',v_row.total_attempt_count+1,
    'workload_score',v_row.workload_score,
    'trigger_reason',v_row.trigger_reason
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_save_safe_step_v2(p_stage_id uuid, p_simulation_run_id uuid, p_lease_token uuid, p_next_step integer, p_checkpoint_text text, p_phase text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_updated integer := 0;
begin
  if p_checkpoint_text is null or length(p_checkpoint_text)=0 then
    raise exception 'Safe checkpoint text cannot be empty';
  end if;

  update public.race_stage_safe_calculation_v1
     set step=greatest(0,p_next_step),
         checkpoint_text=p_checkpoint_text,
         checkpoint_json='{}'::jsonb,
         status='pending',
         lease_token=null,
         lease_expires_at=null,
         step_attempt_count=0,
         last_error=null,
         updated_at=clock_timestamp()
   where stage_id=p_stage_id
     and simulation_run_id=p_simulation_run_id
     and lease_token=p_lease_token
     and status='running';
  get diagnostics v_updated=row_count;

  if v_updated=0 then
    return jsonb_build_object('status','stale_lease');
  end if;

  perform public.universal_race_stage_survival_heartbeat_v1(
    p_stage_id,p_simulation_run_id,
    coalesce(nullif(p_phase,''),'safe_mode_step_saved_'||p_next_step::text),
    jsonb_build_object(
      'next_step',p_next_step,
      'checkpoint_storage','ordered_json_text_v2',
      'checkpoint_bytes',octet_length(p_checkpoint_text),
      'model_version','checkpointed_safe_mode_v2'
    )
  );

  perform public.universal_race_stage_kick_safe_worker_v1();

  return jsonb_build_object(
    'status','saved',
    'next_step',p_next_step,
    'checkpoint_bytes',octet_length(p_checkpoint_text)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_complete_safe_mode_v2(p_stage_id uuid, p_simulation_run_id uuid, p_lease_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_updated integer := 0;
begin
  update public.race_stage_safe_calculation_v1
     set status='completed',
         lease_token=null,
         lease_expires_at=null,
         checkpoint_text='{}',
         checkpoint_json='{}'::jsonb,
         completed_at=clock_timestamp(),
         updated_at=clock_timestamp()
   where stage_id=p_stage_id
     and simulation_run_id=p_simulation_run_id
     and lease_token=p_lease_token
     and status='running';
  get diagnostics v_updated=row_count;

  if v_updated=0 then
    return jsonb_build_object('status','stale_lease');
  end if;

  return jsonb_build_object('status','completed');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_fast_safe_guard_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run record;
  v_switched integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('universal_race_fast_safe_guard_v1',0));

  for v_run in
    select
      sr.id as simulation_run_id,
      sr.stage_id,
      sr.race_id,
      coalesce(sr.result_summary_json->>'survival_phase','') as survival_phase,
      coalesce(
        (sr.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
        sr.updated_at,
        sr.started_at,
        sr.created_at
      ) as heartbeat_at
    from public.race_stage_simulation_runs sr
    where sr.engine_version='race_engine_ts_v1'
      and sr.simulation_mode='deterministic_road_race_v1'
      and sr.status='running'
      and coalesce(sr.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
      and coalesce(sr.result_summary_json->>'survival_phase','')
            in ('primary_engine_started','fallback_engine_started')
      and coalesce(
            (sr.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
            sr.updated_at,
            sr.started_at,
            sr.created_at
          ) < clock_timestamp()-interval '45 seconds'
      and not exists (
        select 1 from public.race_stage_authoritative_runs a
        where a.stage_id=sr.stage_id
      )
      and not exists (
        select 1
        from public.race_stage_safe_calculation_v1 sf
        where sf.stage_id=sr.stage_id
          and sf.simulation_run_id=sr.id
          and sf.status in ('pending','running')
      )
    order by coalesce(sr.updated_at,sr.started_at,sr.created_at)
    limit 20
  loop
    perform public.universal_race_stage_enable_safe_mode_v1(
      v_run.stage_id,
      v_run.simulation_run_id,
      'fast_switch_after_primary_engine_stall',
      0
    );

    insert into public.race_engine_calculation_survival_audit_v1(
      stage_id,race_id,simulation_run_id,action,reason,details
    )
    values(
      v_run.stage_id,
      v_run.race_id,
      v_run.simulation_run_id,
      'fast_switch_to_checkpointed_safe_mode',
      'primary_engine_no_progress_45_seconds',
      jsonb_build_object(
        'previous_phase',v_run.survival_phase,
        'heartbeat_at',v_run.heartbeat_at,
        'stale_seconds',extract(epoch from (clock_timestamp()-v_run.heartbeat_at)),
        'recovery_policy','checkpointed_safe_mode_v2'
      )
    );

    v_switched := v_switched + 1;
  end loop;

  if v_switched > 0 then
    perform public.universal_race_stage_kick_safe_worker_v1();
  end if;

  return jsonb_build_object(
    'status','completed',
    'switched_to_safe_mode',v_switched,
    'stall_threshold_seconds',45,
    'model_version','fast_checkpointed_safe_guard_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_system_health_watchdog_guarded_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare
  v_lock_key bigint := hashtextextended('run_system_health_watchdog_guarded_v2',0);
begin
  if not pg_try_advisory_xact_lock(v_lock_key) then
    return jsonb_build_object(
      'status','skipped_watchdog_already_running',
      'success',true
    );
  end if;

  return public.run_system_health_watchdog_v1();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_safe_mode_watchdog_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run record;
  v_switched integer := 0;
  v_reason text;
begin
  perform pg_advisory_xact_lock(hashtextextended('universal_race_safe_mode_watchdog_v1',0));

  for v_run in
    select
      s.id as simulation_run_id,
      s.stage_id,
      s.status,
      coalesce(s.result_summary_json->>'survival_phase','') as survival_phase,
      coalesce(
        (s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
        s.updated_at,s.started_at,s.created_at
      ) as heartbeat_at
    from public.race_stage_simulation_runs s
    where s.engine_version='race_engine_ts_v1'
      and s.simulation_mode='deterministic_road_race_v1'
      and coalesce(s.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
      and not exists (
        select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.stage_id
      )
      and not exists (
        select 1
        from public.race_stage_safe_calculation_v1 sf
        where sf.stage_id=s.stage_id
          and sf.simulation_run_id=s.id
          and sf.status in ('pending','running','completed')
      )
      and (
        (
          s.status='failed'
          and coalesce(s.result_summary_json->>'survival_phase','') in (
            'pass1_started','pass1_payload_loading','pass1_resume_failed',
            'primary_engine_started','fallback_engine_started',
            'primary_engine_finished','fallback_engine_finished',
            'pass2_resume_failed'
          )
        )
        or
        (
          s.status='running'
          and coalesce(s.result_summary_json->>'survival_phase','') in (
            'pass1_started','pass1_payload_loading',
            'primary_engine_started','fallback_engine_started'
          )
          and coalesce(
            (s.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
            s.updated_at,s.started_at,s.created_at
          ) < clock_timestamp()-interval '60 seconds'
        )
      )
    order by coalesce(s.failed_at,s.updated_at,s.started_at,s.created_at)
    for update of s skip locked
    limit 10
  loop
    v_reason := case
      when v_run.status='failed' then 'first_calculation_failure'
      else 'first_calculation_worker_stopped'
    end;

    perform public.universal_race_stage_enable_safe_mode_v1(
      v_run.stage_id,
      v_run.simulation_run_id,
      v_reason,
      0
    );

    insert into public.race_engine_calculation_survival_audit_v1(
      stage_id,race_id,simulation_run_id,action,reason,details
    )
    select
      s.stage_id,s.race_id,s.id,
      'switch_to_checkpointed_safe_mode',
      v_reason,
      jsonb_build_object(
        'previous_status',v_run.status,
        'previous_phase',v_run.survival_phase,
        'heartbeat_at',v_run.heartbeat_at,
        'watchdog_version','universal_race_safe_mode_watchdog_v1'
      )
    from public.race_stage_simulation_runs s
    where s.id=v_run.simulation_run_id;

    v_switched := v_switched+1;
  end loop;

  if v_switched>0 then
    perform public.universal_race_stage_kick_safe_worker_v1();
  end if;

  return jsonb_build_object(
    'status','completed',
    'switched_to_safe_mode',v_switched,
    'stale_after_seconds',60,
    'model_version','universal_race_safe_mode_watchdog_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_process_maintenance_reminders_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record;
  v_created integer := 0;
  v_reset integer := 0;
  v_game_date date := coalesce(public.get_current_game_date_date(), current_date);
  v_event_key text;
begin
  -- Re-arm reminders after equipment has been repaired above the configured threshold.
  update public.club_equipment_inventory ei
  set metadata = jsonb_set(
        coalesce(ei.metadata,'{}'::jsonb),
        '{maintenance_reminder_active}',
        'false'::jsonb,
        true
      ),
      updated_at = now()
  from public.equipment_premium_preferences pref
  join public.clubs c on c.id=pref.club_id
  where ei.club_id=pref.club_id
    and public.user_has_premium_access_v1(c.owner_user_id)
    and coalesce((ei.metadata->>'maintenance_reminder_active')::boolean,false)=true
    and ei.condition_percent > pref.maintenance_reminder_threshold;

  get diagnostics v_reset = row_count;

  for r in
    select
      ei.id as equipment_id,
      ei.club_id,
      ei.display_name,
      ei.equipment_category,
      ei.condition_percent,
      pref.maintenance_reminder_threshold,
      c.owner_user_id
    from public.club_equipment_inventory ei
    join public.equipment_premium_preferences pref on pref.club_id=ei.club_id
    join public.clubs c on c.id=ei.club_id
    where c.deleted_at is null
      and c.owner_user_id is not null
      and coalesce(c.is_ai,false)=false
      and public.user_has_premium_access_v1(c.owner_user_id)
      and ei.sold_game_date is null
      and ei.discarded_game_date is null
      and lower(coalesce(ei.status,'ready'))='ready'
      and ei.condition_percent <= pref.maintenance_reminder_threshold
      and coalesce((ei.metadata->>'maintenance_reminder_active')::boolean,false)=false
    order by ei.club_id,ei.condition_percent,ei.id
    for update of ei skip locked
  loop
    v_event_key := format(
      'equipment_maintenance_reminder:%s:%s:%s',
      r.equipment_id,
      v_game_date,
      floor(r.condition_percent)::int
    );

    perform public.create_user_game_notification_v1(
      r.owner_user_id,
      'EQUIPMENT_MAINTENANCE_REMINDER',
      'Equipment needs maintenance',
      format(
        '%s is at %s%% condition, below your %s%% maintenance reminder threshold.',
        coalesce(r.display_name,'Equipment'),
        round(r.condition_percent,1),
        r.maintenance_reminder_threshold
      ),
      '/dashboard/equipment?tab=maintenance',
      jsonb_build_object(
        'equipment_id',r.equipment_id,
        'club_id',r.club_id,
        'display_name',r.display_name,
        'equipment_category',r.equipment_category,
        'condition_percent',r.condition_percent,
        'threshold',r.maintenance_reminder_threshold,
        'game_date',v_game_date
      ),
      v_event_key,
      null
    );

    update public.club_equipment_inventory
    set metadata = coalesce(metadata,'{}'::jsonb)
          || jsonb_build_object(
            'maintenance_reminder_active',true,
            'maintenance_reminder_last_game_date',v_game_date,
            'maintenance_reminder_last_condition',r.condition_percent,
            'maintenance_reminder_threshold',r.maintenance_reminder_threshold
          ),
        updated_at=now()
    where id=r.equipment_id;

    v_created := v_created + 1;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'notifications_created',v_created,
    'reminders_rearmed',v_reset,
    'game_date',v_game_date
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.transfer_get_scout_analyst_intelligence_v1(p_club_id uuid, p_rider_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_report record;
  v_analyst record;
  v_quality numeric := 0;
  v_confidence numeric := 20;
  v_tier text := 'basic';
  v_confidence_label text;
begin
  select sr.precision_score,sr.precision_tier,sr.report_json,sr.scout_staff_id
  into v_report
  from public.rider_scout_reports sr
  where sr.club_id=p_club_id and sr.rider_id=p_rider_id
  order by sr.created_at_game_ts desc nulls last,sr.created_at desc
  limit 1;

  select cs.id,cs.staff_name,
         greatest(0,least(100,
           coalesce(cs.expertise,50)*0.35+
           coalesce(cs.experience,50)*0.20+
           coalesce(cs.efficiency,50)*0.25+
           coalesce(cs.potential,50)*0.10+
           coalesce(cs.leadership,50)*0.05+
           coalesce(cs.loyalty,50)*0.05
         )) as quality
  into v_analyst
  from public.club_staff cs
  where cs.club_id=p_club_id
    and cs.role_type='scout_analyst'
    and coalesce(cs.is_active,false)=true
  order by
    (coalesce(cs.expertise,50)*0.35+
     coalesce(cs.experience,50)*0.20+
     coalesce(cs.efficiency,50)*0.25+
     coalesce(cs.potential,50)*0.10+
     coalesce(cs.leadership,50)*0.05+
     coalesce(cs.loyalty,50)*0.05) desc,
    cs.id
  limit 1;

  v_quality:=coalesce(v_analyst.quality,0);
  if v_report.precision_score is not null then
    v_confidence:=v_report.precision_score;
    v_tier:=coalesce(v_report.precision_tier,'basic');
  elsif v_analyst.id is not null then
    v_confidence:=35 + greatest(-5,least(15,(v_quality-50)*0.30));
    v_tier:=case
      when v_quality>=85 then 'elite'
      when v_quality>=70 then 'strong'
      when v_quality>=55 then 'solid'
      else 'basic'
    end;
  end if;

  if v_analyst.id is not null and v_report.precision_score is not null then
    v_confidence:=v_confidence + greatest(-4,least(8,(v_quality-50)*0.16));
  end if;

  v_confidence:=round(greatest(0,least(100,v_confidence)),1);
  v_confidence_label:=case
    when v_confidence>=90 then 'elite'
    when v_confidence>=75 then 'strong'
    when v_confidence>=60 then 'good'
    when v_confidence>=40 then 'fair'
    else 'limited'
  end;

  return jsonb_build_object(
    'has_scout_report',v_report.precision_score is not null,
    'precision_score',v_report.precision_score,
    'precision_tier',coalesce(v_report.precision_tier,v_tier),
    'overall_label',v_report.report_json->'overall'->>'label',
    'potential_label',v_report.report_json->'potential'->>'label',
    'analyst_staff_id',v_analyst.id,
    'analyst_name',v_analyst.staff_name,
    'analyst_quality',case when v_analyst.id is null then null else round(v_quality,1) end,
    'analysis_confidence_pct',v_confidence,
    'analysis_confidence_label',v_confidence_label
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_purchase_race_supplies_system_v1(p_club_id uuid, p_catalog_item_id uuid, p_quantity integer, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_catalog public.equipment_catalog%rowtype;
  v_current_game_date date := coalesce(public.get_current_game_date_date(),current_date);
  v_quantity integer := least(greatest(coalesce(p_quantity,1),1),10000);
  v_existing_hit boolean := false;
  v_technical_company_id uuid;
  v_technical_sponsor_name text;
  v_technical_discount_pct numeric := 0;
  v_unit_price_cash bigint := 0;
  v_total_cost_cash bigint := 0;
  v_finance_tx_id uuid;
  v_result_row jsonb;
begin
  if p_club_id is null or p_catalog_item_id is null then
    raise exception 'Club and catalog item are required.';
  end if;

  if not exists(
    select 1 from public.clubs c
    where c.id=p_club_id and c.deleted_at is null
      and c.owner_user_id is not null and coalesce(c.is_ai,false)=false
  ) then
    raise exception 'Eligible user club not found.';
  end if;

  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception 'Background purchases require an idempotency key.';
  end if;

  select exists(
    select 1
    from public.club_race_supplies crs
    cross join lateral jsonb_array_elements_text(
      coalesce(crs.metadata->'purchase_idempotency_keys','[]'::jsonb)
    ) k(value)
    where crs.club_id=p_club_id and k.value=p_idempotency_key
  ) into v_existing_hit;

  if v_existing_hit then
    return jsonb_build_object('ok',true,'idempotent',true,'club_id',p_club_id);
  end if;

  select * into v_catalog
  from public.equipment_catalog
  where id=p_catalog_item_id and is_active=true
  limit 1;

  if not found or v_catalog.equipment_kind<>'race_supply' then
    raise exception 'Race supply catalog item not found or inactive.';
  end if;

  select
    cs.company_id,
    coalesce(cs.name,sc.name),
    least(greatest(coalesce(nullif(to_jsonb(cs)->>'technical_discount_pct','')::numeric,0),0),95)
  into v_technical_company_id,v_technical_sponsor_name,v_technical_discount_pct
  from public.club_sponsors cs
  left join public.sponsor_companies sc on sc.id=cs.company_id
  where cs.club_id=p_club_id
    and cs.sponsor_kind='technical'
    and cs.status='active'
  order by cs.created_at desc
  limit 1;

  if v_technical_company_id is null
     or v_catalog.brand_company_id is null
     or v_catalog.brand_company_id<>v_technical_company_id
  then
    v_technical_discount_pct:=0;
  end if;

  v_unit_price_cash:=floor(v_catalog.base_price_cash*(1-v_technical_discount_pct/100.0))::bigint;
  v_total_cost_cash:=v_unit_price_cash*v_quantity;

  perform set_config('finance.internal','1',true);

  v_finance_tx_id:=public.finance_spend_from_club(
    p_club_id,
    v_total_cost_cash,
    'race_supplies_purchase',
    'SINK',
    p_idempotency_key,
    jsonb_build_object(
      'catalog_item_id',v_catalog.id,
      'item_key',v_catalog.item_key,
      'display_name',v_catalog.display_name,
      'supply_key',v_catalog.equipment_category,
      'quantity',v_quantity,
      'unit_price_cash',v_unit_price_cash,
      'total_cost_cash',v_total_cost_cash,
      'base_price_cash',v_catalog.base_price_cash,
      'technical_discount_pct',v_technical_discount_pct,
      'technical_sponsor_company_id',v_technical_company_id,
      'technical_sponsor_name',v_technical_sponsor_name,
      'source','equipment_auto_restock_backend'
    )
  );

  insert into public.club_race_supplies(
    club_id,supply_key,display_name,preferred_brand_company_id,
    quantity_available,total_purchased,total_used,last_purchased_game_date,metadata
  )
  values(
    p_club_id,v_catalog.equipment_category,v_catalog.display_name,v_catalog.brand_company_id,
    v_quantity,v_quantity,0,v_current_game_date,
    jsonb_build_object(
      'last_purchase_finance_transaction_id',v_finance_tx_id,
      'last_purchase_idempotency_key',p_idempotency_key,
      'purchase_idempotency_keys',jsonb_build_array(p_idempotency_key),
      'catalog_item_key',v_catalog.item_key,
      'unit_price_cash',v_unit_price_cash,
      'technical_discount_pct',v_technical_discount_pct,
      'technical_sponsor_company_id',v_technical_company_id,
      'technical_sponsor_name',v_technical_sponsor_name,
      'last_purchased_at',now(),
      'last_purchase_source','automatic_restock'
    )
  )
  on conflict(club_id,supply_key) do update
  set display_name=excluded.display_name,
      preferred_brand_company_id=coalesce(excluded.preferred_brand_company_id,club_race_supplies.preferred_brand_company_id),
      quantity_available=club_race_supplies.quantity_available+excluded.quantity_available,
      total_purchased=club_race_supplies.total_purchased+excluded.total_purchased,
      last_purchased_game_date=excluded.last_purchased_game_date,
      metadata=jsonb_set(
        coalesce(club_race_supplies.metadata,'{}'::jsonb)
        || jsonb_build_object(
          'last_purchase_finance_transaction_id',v_finance_tx_id,
          'last_purchase_idempotency_key',p_idempotency_key,
          'catalog_item_key',v_catalog.item_key,
          'unit_price_cash',v_unit_price_cash,
          'technical_discount_pct',v_technical_discount_pct,
          'technical_sponsor_company_id',v_technical_company_id,
          'technical_sponsor_name',v_technical_sponsor_name,
          'last_purchased_at',now(),
          'last_purchase_source','automatic_restock'
        ),
        '{purchase_idempotency_keys}',
        coalesce(club_race_supplies.metadata->'purchase_idempotency_keys','[]'::jsonb)
          || jsonb_build_array(p_idempotency_key),
        true
      ),
      updated_at=now()
  returning to_jsonb(public.club_race_supplies.*) into v_result_row;

  return jsonb_build_object(
    'ok',true,
    'club_id',p_club_id,
    'supply_key',v_catalog.equipment_category,
    'quantity',v_quantity,
    'total_cost_cash',v_total_cost_cash,
    'finance_transaction_id',v_finance_tx_id,
    'race_supply_row',v_result_row
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_process_auto_restock_rules_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record;
  v_catalog_id uuid;
  v_current_stock integer;
  v_total_used integer;
  v_game_date date := coalesce(public.get_current_game_date_date(),current_date);
  v_key text;
  v_result jsonb;
  v_attempted integer:=0;
  v_purchased integer:=0;
  v_failed integer:=0;
begin
  for r in
    select
      ar.club_id,ar.supply_key,ar.minimum_stock,ar.order_quantity,
      ar.updated_at as rule_updated_at,c.owner_user_id
    from public.equipment_auto_restock_rules ar
    join public.clubs c on c.id=ar.club_id
    where ar.enabled=true
      and c.deleted_at is null
      and c.owner_user_id is not null
      and coalesce(c.is_ai,false)=false
      and public.user_has_premium_access_v1(c.owner_user_id)
    order by ar.club_id,ar.supply_key
    for update of ar skip locked
  loop
    select coalesce(crs.quantity_available,0),coalesce(crs.total_used,0)
    into v_current_stock,v_total_used
    from public.club_race_supplies crs
    where crs.club_id=r.club_id and crs.supply_key=r.supply_key;

    v_current_stock:=coalesce(v_current_stock,0);
    v_total_used:=coalesce(v_total_used,0);

    if v_current_stock>=r.minimum_stock then
      continue;
    end if;

    select ec.id
    into v_catalog_id
    from public.equipment_catalog ec
    left join public.club_race_supplies crs
      on crs.club_id=r.club_id and crs.supply_key=r.supply_key
    left join lateral(
      select cs.company_id
      from public.club_sponsors cs
      where cs.club_id=r.club_id
        and cs.sponsor_kind='technical'
        and cs.status='active'
      order by cs.created_at desc
      limit 1
    ) sponsor on true
    where ec.is_active=true
      and ec.equipment_kind='race_supply'
      and ec.equipment_category=r.supply_key
    order by
      case when crs.preferred_brand_company_id is not null
                 and ec.brand_company_id=crs.preferred_brand_company_id then 0 else 1 end,
      case when sponsor.company_id is not null
                 and ec.brand_company_id=sponsor.company_id then 0 else 1 end,
      ec.base_price_cash asc,
      ec.id
    limit 1;

    if v_catalog_id is null then
      v_failed:=v_failed+1;
      continue;
    end if;

    v_attempted:=v_attempted+1;
    v_key:=format(
      'race_supplies_auto_restock:%s:%s:%s:%s:%s',
      r.club_id,r.supply_key,v_game_date,v_total_used,v_current_stock
    );

    begin
      v_result:=public.equipment_purchase_race_supplies_system_v1(
        r.club_id,v_catalog_id,greatest(1,r.order_quantity),v_key
      );

      if coalesce((v_result->>'ok')::boolean,false) then
        v_purchased:=v_purchased+1;
      end if;
    exception when others then
      v_failed:=v_failed+1;

      perform public.create_user_game_notification_v1(
        r.owner_user_id,
        'RACE_SUPPLIES_LOW',
        'Automatic restock could not complete',
        format(
          '%s is below your automatic restock threshold (%s < %s), but the purchase could not be completed.',
          replace(initcap(replace(r.supply_key,'_',' ')),'  ',' '),
          v_current_stock,
          r.minimum_stock
        ),
        '/dashboard/equipment?tab=supplies',
        jsonb_build_object(
          'club_id',r.club_id,
          'supply_key',r.supply_key,
          'current_stock',v_current_stock,
          'minimum_stock',r.minimum_stock,
          'order_quantity',r.order_quantity,
          'automatic_restock',true,
          'error',sqlerrm,
          'game_date',v_game_date
        ),
        format('auto_restock_failed:%s:%s:%s',r.club_id,r.supply_key,v_game_date),
        null
      );
    end;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'attempted',v_attempted,
    'purchased',v_purchased,
    'failed',v_failed,
    'game_date',v_game_date
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.premium_process_manager_automation_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  rr record;
  rp record;
  v_context jsonb;
  v_focus text;
  v_intensity text;
  v_objective text;
  v_strategy text;
  v_risk text;
  v_training_applied integer:=0;
  v_strategy_applied integer:=0;
  v_today date:=coalesce(public.get_current_game_date_date(),current_date);
begin
  -- Training prefill: only riders with no explicit plan, and never compete with
  -- active Head Coach/U23 coach training automation for that sporting club.
  for rr in
    select
      rule.id as rule_id,
      rule.club_id as manager_club_id,
      rule.user_id,
      rule.match_json,
      t.payload_json,
      cr.club_id as rider_club_id,
      cr.rider_id,
      coalesce(cr.assigned_role::text,r.role::text,'') as role,
      coalesce(r.availability_status,'') as availability_status
    from public.premium_manager_automation_rules_v1 rule
    join public.premium_manager_templates_v1 t
      on t.id=rule.template_id
     and t.club_id=rule.club_id
     and t.user_id=rule.user_id
    join public.clubs main on main.id=rule.club_id
    join public.club_riders cr
      on cr.club_id=rule.club_id
      or cr.club_id in (
        select child.id from public.clubs child
        where child.parent_club_id=rule.club_id and child.deleted_at is null
      )
    join public.riders r on r.id=cr.rider_id
    where rule.is_enabled=true
      and rule.rule_type='training_prefill'
      and t.template_type='training'
      and main.owner_user_id=rule.user_id
      and public.user_has_premium_access_v1(rule.user_id)
      and not exists(
        select 1 from public.rider_regular_training_plans p
        where p.rider_id=cr.rider_id
      )
      and not exists(
        select 1 from public.club_regular_training_automation a
        where a.club_id=cr.club_id and a.is_enabled=true
      )
    order by rule.club_id,cr.rider_id,
             jsonb_object_length(coalesce(rule.match_json,'{}'::jsonb)) desc,
             rule.updated_at desc
  loop
    v_context:=jsonb_build_object(
      'availability_status',rr.availability_status,
      'role',rr.role
    );

    if exists(
      select 1
      from jsonb_each_text(coalesce(rr.match_json,'{}'::jsonb)) m
      where coalesce(v_context->>m.key,'')<>m.value
    ) then
      continue;
    end if;

    -- Only the first/best matching rule per rider should apply.
    if exists(
      select 1 from public.rider_regular_training_plans p where p.rider_id=rr.rider_id
    ) then
      continue;
    end if;

    v_focus:=coalesce(nullif(rr.payload_json->>'focus_code',''),'general');
    if v_focus not in ('general','endurance','sprint','climbing','flat','time_trial','recovery','day_off')
    then v_focus:='general'; end if;

    v_intensity:=coalesce(nullif(rr.payload_json->>'intensity',''),'normal');
    if v_intensity not in ('recovery','light','normal','hard')
    then v_intensity:='normal'; end if;

    if v_focus in ('recovery','day_off') and v_intensity='hard' then
      v_intensity:='recovery';
    end if;

    insert into public.rider_regular_training_plans(
      rider_id,club_id,focus_code,intensity,is_active,auto_when_free,preferred_days,updated_at
    )
    values(rr.rider_id,rr.rider_club_id,v_focus,v_intensity,true,true,null,now())
    on conflict(rider_id) do nothing;

    if found then
      update public.premium_manager_automation_rules_v1
      set last_matched_at=now(),updated_at=now()
      where id=rr.rule_id;
      v_training_applied:=v_training_applied+1;
    end if;
  end loop;

  -- Race strategy prefill: only untouched draft stage plans. Never mark them as
  -- saved/submitted and never compete with U23 managed stage-plan automation.
  for rp in
    select
      rule.id as rule_id,
      rule.club_id as manager_club_id,
      rule.user_id,
      rule.match_json,
      t.payload_json,
      rsp.id as stage_plan_id,
      rsp.race_preparation_id,
      rsp.stage_id,
      coalesce(nullif(to_jsonb(rs)->>'terrain_type',''),
               nullif(to_jsonb(rs)->>'profile_type',''),'') as terrain_type,
      coalesce(nullif(to_jsonb(rs)->>'profile_type',''),
               nullif(to_jsonb(rs)->>'terrain_type',''),'') as profile_type,
      coalesce(nullif(to_jsonb(rs)->>'stage_format',''),
               nullif(to_jsonb(rs)->>'stage_type',''),
               nullif(to_jsonb(rs)->>'format',''),'road_race') as stage_format
    from public.premium_manager_automation_rules_v1 rule
    join public.premium_manager_templates_v1 t
      on t.id=rule.template_id
     and t.club_id=rule.club_id
     and t.user_id=rule.user_id
    join public.clubs main on main.id=rule.club_id
    join public.race_preparations prep
      on (
        prep.club_id=rule.club_id
        or prep.participating_club_id=rule.club_id
        or prep.club_id in (
          select child.id from public.clubs child
          where child.parent_club_id=rule.club_id and child.deleted_at is null
        )
        or prep.participating_club_id in (
          select child.id from public.clubs child
          where child.parent_club_id=rule.club_id and child.deleted_at is null
        )
      )
    join public.race_stage_plans rsp on rsp.race_preparation_id=prep.id
    join public.race_stages rs on rs.id=rsp.stage_id
    where rule.is_enabled=true
      and rule.rule_type='strategy_prefill'
      and t.template_type='race_strategy'
      and main.owner_user_id=rule.user_id
      and public.user_has_premium_access_v1(rule.user_id)
      and rsp.status='draft'
      and rsp.last_saved_at is null
      and (rsp.opens_on_game_date is null or rsp.opens_on_game_date<=v_today)
      and (rsp.locks_on_game_date is null or rsp.locks_on_game_date>v_today)
      and not exists(
        select 1
        from public.race_preparation_stage_plan_automation a
        where a.race_preparation_id=prep.id and coalesce(a.is_enabled,false)=true
      )
    order by rsp.id,
             jsonb_object_length(coalesce(rule.match_json,'{}'::jsonb)) desc,
             rule.updated_at desc
  loop
    v_context:=jsonb_build_object(
      'terrain_type',rp.terrain_type,
      'profile_type',rp.profile_type,
      'stage_format',rp.stage_format
    );

    if exists(
      select 1
      from jsonb_each_text(coalesce(rp.match_json,'{}'::jsonb)) m
      where coalesce(v_context->>m.key,'')<>m.value
    ) then
      continue;
    end if;

    -- Only apply once per untouched plan.
    if exists(
      select 1
      from public.race_stage_plans rsp
      where rsp.id=rp.stage_plan_id
        and coalesce(rsp.metadata->>'premium_automation_prefilled','false')='true'
    ) then
      continue;
    end if;

    v_objective:=coalesce(nullif(rp.payload_json->>'stage_objective',''),'balanced');
    if v_objective not in ('balanced','protect_gc','stage_win','sprint','kom','breakaway','safe_finish','recovery_day')
    then v_objective:='balanced'; end if;

    v_strategy:=coalesce(nullif(rp.payload_json->>'team_strategy',''),'balanced');
    if v_strategy not in ('balanced','aggressive','defensive','conservative','sprint_control','breakaway','gc_protection','climber_support','tt_balanced_pace','tt_fast_start','tt_negative_split','tt_all_out')
    then v_strategy:='balanced'; end if;

    v_risk:=coalesce(nullif(rp.payload_json->>'risk_level',''),'normal');
    if v_risk not in ('safe','normal','high') then v_risk:='normal'; end if;

    update public.race_stage_plans
    set stage_objective=v_objective,
        team_strategy=v_strategy,
        risk_level=v_risk,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'premium_automation_prefilled',true,
          'premium_automation_rule_id',rp.rule_id,
          'premium_automation_applied_at',now()
        ),
        updated_at=now()
    where id=rp.stage_plan_id
      and status='draft'
      and last_saved_at is null;

    if found then
      update public.premium_manager_automation_rules_v1
      set last_matched_at=now(),updated_at=now()
      where id=rp.rule_id;
      v_strategy_applied:=v_strategy_applied+1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'training_prefills_applied',v_training_applied,
    'strategy_prefills_applied',v_strategy_applied,
    'game_date',v_today
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_apply_future_flat_sprint_layout_v1(p_source_season integer, p_target_season integer, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source_year integer := 1999 + p_source_season;
  v_target_year integer := 1999 + p_target_season;
  rec record;
  sync_rec record;
  v_seed bytea;
  v_target_count integer;
  v_slot integer;
  v_distance numeric;
  v_desired_km numeric;
  v_pick_km numeric;
  v_spacing numeric;
  v_kms numeric[];
  v_sprints jsonb;
  v_markers jsonb;
  v_route_markers jsonb;
  v_assignments jsonb := '[]'::jsonb;
  v_randomized integer := 0;
  v_sync_repairs integer := 0;
begin
  if p_target_season is distinct from p_source_season + 1 then
    raise exception 'target season must equal source season + 1';
  end if;

  /*
   * Randomize only the historical one-sprint group identified from the
   * SOURCE relational point definitions. This intentionally does not mutate
   * completed source-season sporting history.
   */
  for rec in
    select
      sr.name as race_name,
      ss.id as source_stage_id,
      ss.stage_number,
      ss.distance_km::numeric as distance_km,
      ts.id as target_stage_id,
      ts.race_id as target_race_id,
      ts.terrain_type,
      ts.profile_type,
      ts.stage_format,
      coalesce(ts.metadata,'{}'::jsonb) as target_metadata,
      coalesce(td.route_markers,'[]'::jsonb) as route_markers
    from public.race_stages ss
    join public.races sr on sr.id=ss.race_id
    join public.race_stages ts
      on ts.id=public.season_calendar_deterministic_uuid_v1(
        'stage|'||ss.id::text||'|season|'||p_target_season::text
      )
    join public.races tr on tr.id=ts.race_id
    left join public.race_stage_profile_details td on td.stage_id=ts.id
    where extract(year from sr.start_date)::integer=v_source_year
      and sr.status<>'archived'
      and extract(month from ss.stage_date)::integer in (1,2)
      and lower(coalesce(ss.terrain_type,''))='flat'
      and lower(coalesce(ss.profile_type,'')) not like '%time_trial%'
      and lower(coalesce(ss.stage_format,'')) not in (
        'individual_time_trial','team_time_trial','time_trial','prologue'
      )
      and (
        select count(*)
        from public.race_stage_points sp
        where sp.stage_id=ss.id
          and upper(coalesce(sp.point_type,'')) in (
            'INTERMEDIATE_SPRINT','BONUS_SPRINT'
          )
      )=1
      and extract(year from tr.start_date)::integer=v_target_year
      and tr.metadata->>'calendar_source_season'=p_source_season::text
    order by sr.start_date,sr.name,ss.stage_number
  loop
    if exists (
      select 1 from public.race_stage_results x where x.stage_id=rec.target_stage_id
      union all
      select 1 from public.race_stage_point_results x where x.stage_id=rec.target_stage_id
      union all
      select 1 from public.race_stage_simulation_runs x where x.stage_id=rec.target_stage_id
    ) then
      raise exception
        'Refusing to alter sprint layout for target stage % because sporting output already exists',
        rec.target_stage_id;
    end if;

    v_distance := rec.distance_km;
    v_seed := decode(
      md5(rec.source_stage_id::text||'|season|'||p_target_season::text||'|flat-sprints-v1'),
      'hex'
    );
    v_target_count := 2 + (get_byte(v_seed,0) % 3);
    v_spacing := greatest(8::numeric, v_distance * 0.07);
    v_kms := array[]::numeric[];

    for v_slot in 1..v_target_count loop
      v_desired_km :=
        (
          (v_slot::numeric / (v_target_count + 1)::numeric)
          + (((get_byte(v_seed,least(15,v_slot))::numeric / 255) - 0.5) * 0.08)
        ) * v_distance;

      select round(((seg.km_start+seg.km_end)/2.0)::numeric,1)
      into v_pick_km
      from public.race_engine_get_stage_segments_v1(rec.target_stage_id) seg
      where seg.terrain_type='flat'
        and ((seg.km_start+seg.km_end)/2.0)
              between greatest(8::numeric,v_distance*0.08)
                  and least(v_distance-8::numeric,v_distance*0.92)
        and not exists (
          select 1
          from unnest(v_kms) already(km)
          where abs(((seg.km_start+seg.km_end)/2.0)-already.km) < v_spacing
        )
        and not exists (
          select 1
          from public.race_stage_points existing
          where existing.stage_id=rec.target_stage_id
            and upper(coalesce(existing.point_type,''))='KOM'
            and abs(existing.km_from_start::numeric-((seg.km_start+seg.km_end)/2.0)) < 2
        )
      order by
        abs(((seg.km_start+seg.km_end)/2.0)-v_desired_km),
        seg.segment_order
      limit 1;

      if v_pick_km is null then
        select round(((seg.km_start+seg.km_end)/2.0)::numeric,1)
        into v_pick_km
        from public.race_engine_get_stage_segments_v1(rec.target_stage_id) seg
        where seg.terrain_type='flat'
          and ((seg.km_start+seg.km_end)/2.0)
                between greatest(5::numeric,v_distance*0.05)
                    and least(v_distance-5::numeric,v_distance*0.95)
          and not (((seg.km_start+seg.km_end)/2.0)=any(v_kms))
        order by
          abs(((seg.km_start+seg.km_end)/2.0)-v_desired_km),
          seg.segment_order
        limit 1;
      end if;

      if v_pick_km is null then
        raise exception
          'No distinct flat segment available for sprint %/% on target stage %',
          v_slot,v_target_count,rec.target_stage_id;
      end if;

      v_kms := array_append(v_kms,v_pick_km);
    end loop;

    select array_agg(km order by km)
    into v_kms
    from unnest(v_kms) u(km);

    select jsonb_agg(
      jsonb_build_object(
        'km',u.km,
        'number',u.ordinal_number,
        'points','standard',
        'points_scheme','[12,8,5,3,1]'::jsonb,
        'time_bonus_seconds','[3,2,1]'::jsonb
      )
      order by u.km
    )
    into v_sprints
    from unnest(v_kms) with ordinality u(km,ordinal_number);

    select coalesce(
      jsonb_agg(marker order by marker_km, marker_order, marker_label),
      '[]'::jsonb
    )
    into v_markers
    from (
      select
        m.value as marker,
        coalesce(nullif(m.value->>'km','')::numeric,0) as marker_km,
        case lower(coalesce(m.value->>'type',''))
          when 'start' then 0
          when 'finish' then 30
          else 20
        end as marker_order,
        coalesce(m.value->>'label',m.value->>'name','') as marker_label
      from jsonb_array_elements(rec.route_markers) m(value)
      where lower(coalesce(m.value->>'type',m.value->>'point_type',''))
        not in ('sprint','intermediate_sprint','bonus_sprint')

      union all

      select
        jsonb_build_object(
          'km',u.km,
          'type','sprint',
          'label','Sprint '||u.ordinal_number::text
        ),
        u.km,
        10,
        'Sprint '||u.ordinal_number::text
      from unnest(v_kms) with ordinality u(km,ordinal_number)
    ) marker_rows;

    v_assignments := v_assignments || jsonb_build_array(
      jsonb_build_object(
        'race',rec.race_name,
        'stage',rec.stage_number,
        'source_stage_id',rec.source_stage_id,
        'target_stage_id',rec.target_stage_id,
        'sprint_count',v_target_count,
        'sprint_km',to_jsonb(v_kms)
      )
    );
    v_randomized := v_randomized + 1;

    if p_dry_run then
      continue;
    end if;

    update public.race_stages
    set intermediate_sprints_json=v_sprints,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'sprint_layout_policy_version','flat_random_2_4_v1',
          'sprint_layout_source_stage_id',rec.source_stage_id,
          'sprint_layout_source_season',p_source_season,
          'sprint_layout_target_season',p_target_season,
          'sprint_layout_count',v_target_count
        )
    where id=rec.target_stage_id;

    update public.race_stage_profile_details
    set intermediate_sprints=v_sprints,
        route_markers=v_markers,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'sprint_layout_policy_version','flat_random_2_4_v1'
        )
    where stage_id=rec.target_stage_id;

    if not found then
      raise exception 'Target profile row missing for stage %',rec.target_stage_id;
    end if;

    delete from public.race_stage_points
    where stage_id=rec.target_stage_id
      and upper(coalesce(point_type,'')) in (
        'INTERMEDIATE_SPRINT','BONUS_SPRINT'
      );

    insert into public.race_stage_points(
      stage_id,
      point_type,
      km_from_start,
      name,
      kom_category,
      points_scheme,
      time_bonus_seconds,
      is_finish_point,
      sort_order,
      metadata
    )
    select
      rec.target_stage_id,
      'INTERMEDIATE_SPRINT',
      u.km,
      'Intermediate sprint '||u.ordinal_number::text,
      null,
      '[12,8,5,3,1]'::jsonb,
      '[3,2,1]'::jsonb,
      false,
      (u.ordinal_number::integer)*10,
      jsonb_build_object(
        'source','flat_random_2_4_v1',
        'source_stage_id',rec.source_stage_id,
        'target_season',p_target_season
      )
    from unnest(v_kms) with ordinality u(km,ordinal_number);

    with ranked as (
      select
        id,
        ((row_number() over(
          order by km_from_start,
                   case upper(coalesce(point_type,''))
                     when 'START' then 0
                     when 'INTERMEDIATE_SPRINT' then 10
                     when 'BONUS_SPRINT' then 10
                     when 'KOM' then 20
                     when 'FINISH' then 30
                     else 25
                   end,
                   id
        )-1)*10)::integer as new_sort_order
      from public.race_stage_points
      where stage_id=rec.target_stage_id
    )
    update public.race_stage_points p
    set sort_order=r.new_sort_order
    from ranked r
    where p.id=r.id
      and p.sort_order is distinct from r.new_sort_order;
  end loop;

  /*
   * Repair copied future definitions when the source relational sprint rows
   * already contain the correct multi-sprint logic but stage/profile JSON do
   * not. This preserves sporting logic and only synchronizes the future copy.
   */
  for sync_rec in
    select
      sr.name as race_name,
      ss.id as source_stage_id,
      ss.stage_number,
      ts.id as target_stage_id,
      coalesce(td.route_markers,'[]'::jsonb) as route_markers
    from public.race_stages ss
    join public.races sr on sr.id=ss.race_id
    join public.race_stages ts
      on ts.id=public.season_calendar_deterministic_uuid_v1(
        'stage|'||ss.id::text||'|season|'||p_target_season::text
      )
    join public.races tr on tr.id=ts.race_id
    left join public.race_stage_profile_details td on td.stage_id=ts.id
    where extract(year from sr.start_date)::integer=v_source_year
      and sr.status<>'archived'
      and extract(month from ss.stage_date)::integer in (1,2)
      and lower(coalesce(ss.terrain_type,''))='flat'
      and lower(coalesce(ss.profile_type,'')) not like '%time_trial%'
      and lower(coalesce(ss.stage_format,'')) not in (
        'individual_time_trial','team_time_trial','time_trial','prologue'
      )
      and (
        select count(*)
        from public.race_stage_points sp
        where sp.stage_id=ss.id
          and upper(coalesce(sp.point_type,'')) in (
            'INTERMEDIATE_SPRINT','BONUS_SPRINT'
          )
      ) >= 2
      and (
        select count(*)
        from public.race_stage_points sp
        where sp.stage_id=ss.id
          and upper(coalesce(sp.point_type,'')) in (
            'INTERMEDIATE_SPRINT','BONUS_SPRINT'
          )
      ) <> jsonb_array_length(coalesce(ss.intermediate_sprints_json,'[]'::jsonb))
      and extract(year from tr.start_date)::integer=v_target_year
      and tr.metadata->>'calendar_source_season'=p_source_season::text
      and coalesce(ts.metadata->>'sprint_sync_repair_version','')
          <> 'source_points_v1'
  loop
    select jsonb_agg(
      jsonb_build_object(
        'km',p.km_from_start::numeric,
        'number',row_number_value,
        'name',p.name,
        'point_type',upper(p.point_type),
        'points','standard',
        'points_scheme',coalesce(p.points_scheme,'[]'::jsonb),
        'time_bonus_seconds',coalesce(p.time_bonus_seconds,'[]'::jsonb)
      )
      order by p.km_from_start
    )
    into v_sprints
    from (
      select
        p.*,
        row_number() over(order by p.km_from_start,p.id) as row_number_value
      from public.race_stage_points p
      where p.stage_id=sync_rec.source_stage_id
        and upper(coalesce(p.point_type,'')) in (
          'INTERMEDIATE_SPRINT','BONUS_SPRINT'
        )
    ) p;

    select coalesce(
      jsonb_agg(marker order by marker_km, marker_order, marker_label),
      '[]'::jsonb
    )
    into v_markers
    from (
      select
        m.value as marker,
        coalesce(nullif(m.value->>'km','')::numeric,0) as marker_km,
        case lower(coalesce(m.value->>'type',''))
          when 'start' then 0
          when 'finish' then 30
          else 20
        end as marker_order,
        coalesce(m.value->>'label',m.value->>'name','') as marker_label
      from jsonb_array_elements(sync_rec.route_markers) m(value)
      where lower(coalesce(m.value->>'type',m.value->>'point_type',''))
        not in ('sprint','intermediate_sprint','bonus_sprint')

      union all

      select
        jsonb_build_object(
          'km',(s.item->>'km')::numeric,
          'type','sprint',
          'label','Sprint '||s.ordinal_number::text
        ),
        (s.item->>'km')::numeric,
        10,
        'Sprint '||s.ordinal_number::text
      from jsonb_array_elements(v_sprints) with ordinality s(item,ordinal_number)
    ) marker_rows;

    v_sync_repairs := v_sync_repairs + 1;

    if p_dry_run then
      continue;
    end if;

    update public.race_stages
    set intermediate_sprints_json=v_sprints,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'sprint_sync_repair_version','source_points_v1',
          'sprint_sync_source_stage_id',sync_rec.source_stage_id
        )
    where id=sync_rec.target_stage_id;

    update public.race_stage_profile_details
    set intermediate_sprints=v_sprints,
        route_markers=v_markers,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'sprint_sync_repair_version','source_points_v1'
        )
    where stage_id=sync_rec.target_stage_id;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'policy_version','flat_random_2_4_v1',
    'source_season',p_source_season,
    'target_season',p_target_season,
    'dry_run',p_dry_run,
    'randomized_stages',v_randomized,
    'future_sync_repairs',v_sync_repairs,
    'assignments',v_assignments
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_season_calendar_stage_point_reconciliation_v3(p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_source_year integer := 1999+p_source_season;
  v_target_year integer := 1999+p_target_season;
  v_unexplained integer := 0;
  v_invalid_policy integer := 0;
  v_policy_stages integer := 0;
  v_orphans integer := 0;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'target season must equal source season + 1';
  end if;

  v_base := public.validate_season_calendar_stage_point_reconciliation_v2(
    p_source_season,p_target_season
  );

  if coalesce((v_base->>'ok')::boolean,false) then
    return v_base || jsonb_build_object(
      'validator_version','v3',
      'sprint_policy_stages',0,
      'sprint_policy_invalid',0,
      'unexplained_point_divergence_stages',0
    );
  end if;

  v_orphans := coalesce((v_base->>'orphan_target_points')::integer,0);

  with paired as (
    select
      ss.id source_stage_id,
      ts.id target_stage_id,
      coalesce(ts.metadata->>'sprint_layout_policy_version','') policy_version,
      (select count(*) from public.race_stage_points sp where sp.stage_id=ss.id) source_count,
      (select count(*) from public.race_stage_points tp where tp.stage_id=ts.id) target_count
    from public.race_stages ss
    join public.races sr on sr.id=ss.race_id
    join public.race_stages ts
      on ts.id=public.season_calendar_deterministic_uuid_v1(
        'stage|'||ss.id::text||'|season|'||p_target_season::text
      )
    join public.races tr on tr.id=ts.race_id
    where extract(year from sr.start_date)::integer=v_source_year
      and sr.status<>'archived'
      and extract(year from tr.start_date)::integer=v_target_year
      and tr.metadata->>'calendar_source_season'=p_source_season::text
  )
  select count(*)::integer
  into v_unexplained
  from paired
  where source_count<>target_count
    and policy_version<>'flat_random_2_4_v1';

  select count(*)::integer
  into v_policy_stages
  from public.race_stages ts
  join public.races tr on tr.id=ts.race_id
  where extract(year from tr.start_date)::integer=v_target_year
    and tr.metadata->>'calendar_source_season'=p_source_season::text
    and ts.metadata->>'sprint_layout_policy_version'='flat_random_2_4_v1';

  select count(*)::integer
  into v_invalid_policy
  from public.race_stages ts
  join public.races tr on tr.id=ts.race_id
  left join public.race_stage_profile_details d on d.stage_id=ts.id
  where extract(year from tr.start_date)::integer=v_target_year
    and tr.metadata->>'calendar_source_season'=p_source_season::text
    and ts.metadata->>'sprint_layout_policy_version'='flat_random_2_4_v1'
    and (
      jsonb_array_length(coalesce(ts.intermediate_sprints_json,'[]'::jsonb)) not between 2 and 4
      or jsonb_array_length(coalesce(d.intermediate_sprints,'[]'::jsonb))
           <> jsonb_array_length(coalesce(ts.intermediate_sprints_json,'[]'::jsonb))
      or (
        select count(*)
        from public.race_stage_points p
        where p.stage_id=ts.id
          and upper(coalesce(p.point_type,'')) in ('INTERMEDIATE_SPRINT','BONUS_SPRINT')
      ) <> jsonb_array_length(coalesce(ts.intermediate_sprints_json,'[]'::jsonb))
      or (
        select count(*)
        from jsonb_array_elements(coalesce(d.route_markers,'[]'::jsonb)) m
        where lower(coalesce(m->>'type',m->>'point_type',''))
              in ('sprint','intermediate_sprint','bonus_sprint')
      ) <> jsonb_array_length(coalesce(ts.intermediate_sprints_json,'[]'::jsonb))
      or exists (
        (
          select round((j->>'km')::numeric,1)
          from jsonb_array_elements(coalesce(ts.intermediate_sprints_json,'[]'::jsonb)) j
          except
          select round(p.km_from_start::numeric,1)
          from public.race_stage_points p
          where p.stage_id=ts.id
            and upper(coalesce(p.point_type,'')) in ('INTERMEDIATE_SPRINT','BONUS_SPRINT')
        )
        union all
        (
          select round(p.km_from_start::numeric,1)
          from public.race_stage_points p
          where p.stage_id=ts.id
            and upper(coalesce(p.point_type,'')) in ('INTERMEDIATE_SPRINT','BONUS_SPRINT')
          except
          select round((j->>'km')::numeric,1)
          from jsonb_array_elements(coalesce(ts.intermediate_sprints_json,'[]'::jsonb)) j
        )
      )
      or exists (
        select 1
        from public.race_stage_points p
        where p.stage_id=ts.id
          and upper(coalesce(p.point_type,'')) in ('INTERMEDIATE_SPRINT','BONUS_SPRINT')
          and not exists (
            select 1
            from public.race_engine_get_stage_segments_v1(ts.id) seg
            where seg.terrain_type='flat'
              and p.km_from_start::numeric between seg.km_start and seg.km_end
          )
      )
      or exists(select 1 from public.race_stage_results x where x.stage_id=ts.id)
      or exists(select 1 from public.race_stage_point_results x where x.stage_id=ts.id)
      or exists(select 1 from public.race_stage_simulation_runs x where x.stage_id=ts.id)
    );

  if v_orphans=0 and v_unexplained=0 and v_invalid_policy=0 and v_policy_stages>0 then
    return v_base || jsonb_build_object(
      'ok',true,
      'validator_version','v3',
      'base_validator_ok',false,
      'sprint_policy_stages',v_policy_stages,
      'sprint_policy_invalid',v_invalid_policy,
      'unexplained_point_divergence_stages',v_unexplained,
      'policy','Target point-count divergence is allowed only for synchronized flat_random_2_4_v1 future stages whose sprint JSON, profile markers, relational points, flat-segment placement, and no-sporting-output invariants all validate.'
    );
  end if;

  return v_base || jsonb_build_object(
    'ok',false,
    'validator_version','v3',
    'base_validator_ok',coalesce((v_base->>'ok')::boolean,false),
    'sprint_policy_stages',v_policy_stages,
    'sprint_policy_invalid',v_invalid_policy,
    'unexplained_point_divergence_stages',v_unexplained
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_future_flat_sprint_layout_v1(p_source_season integer DEFAULT 1, p_target_season integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_before integer;
  v_after integer;
  v_first jsonb;
  v_second jsonb;
  v_validate_first jsonb;
  v_validate_second jsonb;
  v_points_first integer;
  v_points_second integer;
  v_policy_stages integer;
  v_ok boolean := false;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'target season must equal source season + 1';
  end if;

  select count(*)::integer
  into v_before
  from public.races
  where extract(year from start_date)::integer=1999+p_target_season;

  begin
    v_first := public.prepare_next_season_race_calendar_v1(
      p_source_season,p_target_season,true
    );

    v_validate_first :=
      public.validate_season_calendar_stage_point_reconciliation_v3(
        p_source_season,p_target_season
      );

    select count(*)::integer
    into v_points_first
    from public.race_stage_points p
    join public.race_stages s on s.id=p.stage_id
    join public.races r on r.id=s.race_id
    where extract(year from r.start_date)::integer=1999+p_target_season
      and r.metadata->>'calendar_source_season'=p_source_season::text;

    v_second := public.prepare_next_season_race_calendar_v1(
      p_source_season,p_target_season,true
    );

    v_validate_second :=
      public.validate_season_calendar_stage_point_reconciliation_v3(
        p_source_season,p_target_season
      );

    select count(*)::integer
    into v_points_second
    from public.race_stage_points p
    join public.race_stages s on s.id=p.stage_id
    join public.races r on r.id=s.race_id
    where extract(year from r.start_date)::integer=1999+p_target_season
      and r.metadata->>'calendar_source_season'=p_source_season::text;

    select count(*)::integer
    into v_policy_stages
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where extract(year from r.start_date)::integer=1999+p_target_season
      and r.metadata->>'calendar_source_season'=p_source_season::text
      and s.metadata->>'sprint_layout_policy_version'='flat_random_2_4_v1';

    v_ok :=
      coalesce((v_first->>'ok')::boolean,false)
      and coalesce((v_second->>'ok')::boolean,false)
      and coalesce((v_validate_first->>'ok')::boolean,false)
      and coalesce((v_validate_second->>'ok')::boolean,false)
      and coalesce((v_validate_first->>'sprint_policy_invalid')::integer,-1)=0
      and coalesce((v_validate_second->>'sprint_policy_invalid')::integer,-1)=0
      and coalesce((v_first->'flat_sprint_layout'->>'randomized_stages')::integer,-1)=25
      and coalesce((v_second->'flat_sprint_layout'->>'randomized_stages')::integer,-1)=25
      and coalesce((v_first->'flat_sprint_layout'->>'future_sync_repairs')::integer,-1)=1
      and v_policy_stages=25
      and v_points_first=v_points_second;

    raise exception '__ROLLBACK_FLAT_SPRINT_LAYOUT_DRY_RUN__';
  exception when others then
    if sqlerrm<>'__ROLLBACK_FLAT_SPRINT_LAYOUT_DRY_RUN__' then
      raise;
    end if;
  end;

  select count(*)::integer
  into v_after
  from public.races
  where extract(year from start_date)::integer=1999+p_target_season;

  v_ok := v_ok and v_after=v_before;

  return jsonb_build_object(
    'ok',v_ok,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'first_prepare',v_first->'flat_sprint_layout',
    'first_validation',v_validate_first,
    'second_prepare',v_second->'flat_sprint_layout',
    'second_validation',v_validate_second,
    'points_after_first',v_points_first,
    'points_after_second',v_points_second,
    'policy_stages',v_policy_stages,
    'target_races_before',v_before,
    'target_races_after_rollback',v_after
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_final_date_v1(p_country_code text, p_season_number integer)
 RETURNS date
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  s jsonb;
begin
  s := public.national_championship_schedule_v1(p_country_code,p_season_number);
  if s->>'status'='ready' then
    return (s->>'final_date')::date;
  end if;

  return make_date(1999+p_season_number,7,1);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_national_championship_editions_for_season_v1(p_season_number integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  cfg public.national_championship_config%rowtype;
  inserted_count integer := 0;
  s jsonb;
  x record;
begin
  select * into cfg
  from public.national_championship_config
  where id=true;

  for x in
    select distinct upper(country_code) as country_code
    from public.riders
    where nullif(trim(country_code),'') is not null
    order by 1
  loop
    s := public.national_championship_schedule_v1(x.country_code,p_season_number);

    insert into public.national_championship_editions(
      season_number,
      country_code,
      discipline,
      ranking_snapshot_date,
      qualification_date,
      final_date,
      final_field_size,
      duty_window_start_date,
      duty_window_end_date,
      participation_decision_deadline,
      climate_source_country_code,
      climate_week_of_year,
      climate_expected_max_temp_c,
      climate_status
    )
    values(
      p_season_number,
      x.country_code,
      'road',
      case when s->>'status'='ready'
        then (s->>'duty_window_start_date')::date-cfg.ranking_freeze_lead_days
        else make_date(1999+p_season_number,7,1)-cfg.ranking_freeze_lead_days
      end,
      case when s->>'status'='ready'
        then (s->>'qualification_date')::date
        else make_date(1999+p_season_number,7,1)
      end,
      case when s->>'status'='ready'
        then (s->>'final_date')::date
        else make_date(1999+p_season_number,7,3)
      end,
      cfg.final_field_size,
      case when s->>'status'='ready'
        then (s->>'duty_window_start_date')::date
        else null
      end,
      case when s->>'status'='ready'
        then (s->>'duty_window_end_date')::date
        else null
      end,
      case when s->>'status'='ready'
        then (s->>'duty_window_start_date')::date-cfg.participation_decision_lead_days
        else null
      end,
      s->>'climate_source_country_code',
      nullif(s->>'week_of_year','')::integer,
      nullif(s->>'expected_max_temp_c','')::numeric,
      coalesce(s->>'status','weather_data_unavailable')
    )
    on conflict (season_number,country_code,discipline) do nothing;

    if found then
      inserted_count:=inserted_count+1;
    end if;
  end loop;

  perform public.national_championship_refresh_planned_editions_v1(p_season_number);

  perform public.ensure_world_road_championship_for_season_v1(p_season_number);

  return inserted_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.freeze_national_championship_ranking_base_v1(p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  cfg public.national_championship_config%rowtype;
  v_eligible integer;
  v_direct integer;
  v_qualification_places integer;
  v_heat_count integer;
  v_heat integer;
  v_base_places integer;
  v_remainder integer;
  v_plan jsonb;
  v_schedule jsonb;
  v_first_event date;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id
  for update;

  if e.id is null then
    raise exception 'National championship edition not found: %',p_edition_id;
  end if;

  if e.status<>'planned' then
    return jsonb_build_object(
      'edition_id',e.id,
      'status',e.status,
      'already_processed',true
    );
  end if;

  select * into cfg
  from public.national_championship_config
  where id=true;

  select count(*)::int
  into v_eligible
  from public.preview_national_ranking_v1(
    e.country_code,e.ranking_snapshot_date
  );

  v_plan:=public.national_championship_population_plan_v1(v_eligible);

  if coalesce(e.schedule_draw_status,'pending')='locked' then
    v_direct:=coalesce(e.direct_qualifier_count,(v_plan->>'direct_qualifiers')::int,0);
    v_qualification_places:=coalesce(e.qualification_places,(v_plan->>'qualification_places')::int,0);
    v_heat_count:=coalesce(e.qualification_heat_count,(v_plan->>'heat_count')::int,0);

    v_schedule:=jsonb_build_object(
      'climate_status',e.climate_status,
      'route_status',e.route_status,
      'qualification_window_start_date',e.qualification_window_start_date,
      'qualification_window_end_date',e.qualification_window_end_date,
      'qualification_date',e.qualification_date,
      'final_date',e.final_date,
      'qualification_source_stage_id',e.qualification_source_stage_id,
      'final_source_stage_id',e.final_source_stage_id,
      'climate_source_country_code',e.climate_source_country_code,
      'week_of_year',e.climate_week_of_year,
      'expected_max_temp_c',e.climate_expected_max_temp_c
    );
  else
    v_direct:=coalesce((v_plan->>'direct_qualifiers')::int,0);
    v_qualification_places:=coalesce((v_plan->>'qualification_places')::int,0);
    v_heat_count:=coalesce((v_plan->>'heat_count')::int,0);

    v_schedule:=public.national_championship_schedule_plan_v2(
      e.country_code,e.season_number,v_eligible
    );
  end if;

  if coalesce(v_schedule->>'climate_status','')<>'ready' then
    return jsonb_build_object(
      'edition_id',e.id,
      'status','waiting_for_climate',
      'climate_status',v_schedule->>'climate_status'
    );
  end if;

  if coalesce(v_schedule->>'route_status','')<>'ready' then
    return jsonb_build_object(
      'edition_id',e.id,
      'status','waiting_for_routes',
      'route_status',v_schedule->>'route_status'
    );
  end if;

  v_first_event:=case
    when v_heat_count>0
      then (v_schedule->>'qualification_window_start_date')::date
    else (v_schedule->>'final_date')::date
  end;

  update public.national_championship_editions
  set eligible_count=v_eligible,
      final_field_size=least(v_eligible,cfg.final_field_size),
      direct_qualifier_count=v_direct,
      qualification_places=v_qualification_places,
      qualification_heat_count=v_heat_count,
      qualification_window_start_date=nullif(v_schedule->>'qualification_window_start_date','')::date,
      qualification_window_end_date=nullif(v_schedule->>'qualification_window_end_date','')::date,
      final_window_start_date=(v_schedule->>'final_date')::date,
      final_window_end_date=(v_schedule->>'final_date')::date,
      duty_window_start_date=v_first_event,
      duty_window_end_date=case
        when v_heat_count>0
          then (v_schedule->>'qualification_window_end_date')::date
        else (v_schedule->>'final_date')::date
      end,
      qualification_date=(v_schedule->>'qualification_date')::date,
      final_date=(v_schedule->>'final_date')::date,
      ranking_snapshot_date=v_first_event-cfg.ranking_freeze_lead_days,
      participation_decision_deadline=v_first_event-cfg.participation_decision_lead_days,
      climate_source_country_code=v_schedule->>'climate_source_country_code',
      climate_week_of_year=nullif(v_schedule->>'week_of_year','')::int,
      climate_expected_max_temp_c=nullif(v_schedule->>'expected_max_temp_c','')::numeric,
      climate_status='ready',
      route_status='ready',
      qualification_source_stage_id=(v_schedule->>'qualification_source_stage_id')::uuid,
      final_source_stage_id=(v_schedule->>'final_source_stage_id')::uuid,
      updated_at=now()
  where id=e.id
  returning * into e;

  insert into public.national_championship_ranking_snapshots(
    edition_id,rider_id,club_id,national_rank,raw_points,weighted_points,
    best_weighted_result,latest_result_date,overall_snapshot,
    rider_name_snapshot,country_code_snapshot
  )
  select
    e.id,p.rider_id,p.club_id,p.national_rank,p.raw_points,p.weighted_points,
    p.best_weighted_result,p.latest_result_date,p.overall,p.rider_name,p.country_code
  from public.preview_national_ranking_v1(e.country_code,e.ranking_snapshot_date) p;

  if v_heat_count>0 then
    v_base_places:=floor(v_qualification_places::numeric/v_heat_count)::int;
    v_remainder:=mod(v_qualification_places,v_heat_count);

    for v_heat in 1..v_heat_count loop
      insert into public.national_championship_heats(
        edition_id,heat_number,qualification_date,qualifying_places
      )
      values(
        e.id,
        v_heat,
        e.qualification_date+(v_heat-1),
        v_base_places+case when v_heat<=v_remainder then 1 else 0 end
      );
    end loop;
  end if;

  if v_heat_count=0 then
    insert into public.national_championship_entries(
      edition_id,rider_id,club_id_snapshot,national_rank,entry_path,entry_status,
      seed_number,rider_name_snapshot,country_code_snapshot
    )
    select
      e.id,s.rider_id,s.club_id,s.national_rank,'direct','direct_qualified',
      s.national_rank,s.rider_name_snapshot,s.country_code_snapshot
    from public.national_championship_ranking_snapshots s
    where s.edition_id=e.id
    order by s.national_rank;
  else
    insert into public.national_championship_entries(
      edition_id,rider_id,club_id_snapshot,national_rank,entry_path,entry_status,
      heat_id,heat_number,seed_number,rider_name_snapshot,country_code_snapshot
    )
    select
      e.id,
      s.rider_id,
      s.club_id,
      s.national_rank,
      'qualification',
      'qualification_assigned',
      h.id,
      q.heat_number,
      s.national_rank,
      s.rider_name_snapshot,
      s.country_code_snapshot
    from public.national_championship_ranking_snapshots s
    cross join lateral(
      select case
        when (floor(((s.national_rank-1)::numeric)/v_heat_count)::int % 2)=0
          then ((s.national_rank-1)%v_heat_count)+1
        else v_heat_count-((s.national_rank-1)%v_heat_count)
      end as heat_number
    ) q
    join public.national_championship_heats h
      on h.edition_id=e.id and h.heat_number=q.heat_number
    where s.edition_id=e.id
    order by s.national_rank;
  end if;

  update public.national_championship_entries en
  set participation_decision=case
      when en.club_id_snapshot is null then 'auto_approved'
      when coalesce(root.is_ai,false) or root.owner_user_id is null
        then 'auto_approved'
      else 'pending'
    end,
    participation_decision_at=case
      when en.club_id_snapshot is null
        or coalesce(root.is_ai,false)
        or root.owner_user_id is null
        then now()
      else null
    end,
    updated_at=now()
  from public.clubs rc
  left join public.clubs root_parent on root_parent.id=rc.parent_club_id
  cross join lateral(
    select
      case when rc.club_type='developing' and rc.parent_club_id is not null
        then coalesce(root_parent.is_ai,false)
        else coalesce(rc.is_ai,false)
      end is_ai,
      case when rc.club_type='developing' and rc.parent_club_id is not null
        then root_parent.owner_user_id
        else rc.owner_user_id
      end owner_user_id
  ) root
  where en.edition_id=e.id
    and en.club_id_snapshot=rc.id;

  update public.national_championship_entries
  set participation_decision='auto_approved',
      participation_decision_at=now(),
      updated_at=now()
  where edition_id=e.id
    and club_id_snapshot is null;

  update public.national_championship_heats h
  set assigned_count=x.assigned_count,updated_at=now()
  from(
    select heat_id,count(*)::int assigned_count
    from public.national_championship_entries
    where edition_id=e.id
      and heat_id is not null
      and entry_status<>'withdrawn'
    group by heat_id
  ) x
  where h.id=x.heat_id;

  insert into public.national_championship_duties(
    edition_id,rider_id,duty_type,duty_date,heat_id,status,label,
    duty_start_date,duty_end_date
  )
  select
    e.id,
    en.rider_id,
    case when v_heat_count=0 then 'final' else 'qualification' end,
    case when v_heat_count=0 then e.final_date else h.qualification_date end,
    en.heat_id,
    'confirmed',
    case
      when v_heat_count=0
        then 'National Duty — '||e.country_code||' National Road Championship'
      else 'National Duty — '||e.country_code||' National Qualification Group '||en.heat_number
    end,
    case when v_heat_count=0 then e.final_date else h.qualification_date end,
    case when v_heat_count=0 then e.final_date else h.qualification_date end
  from public.national_championship_entries en
  left join public.national_championship_heats h on h.id=en.heat_id
  where en.edition_id=e.id
  on conflict (edition_id,rider_id,duty_type) do update
    set duty_date=excluded.duty_date,
        heat_id=excluded.heat_id,
        label=excluded.label,
        status='confirmed',
        duty_start_date=excluded.duty_start_date,
        duty_end_date=excluded.duty_end_date,
        updated_at=now();

  update public.national_championship_editions
  set status='ranking_frozen',updated_at=now()
  where id=e.id;

  return jsonb_build_object(
    'edition_id',e.id,
    'country_code',e.country_code,
    'eligible_count',v_eligible,
    'direct_qualifiers',v_direct,
    'qualification_population',case when v_heat_count>0 then v_eligible else 0 end,
    'qualification_places',v_qualification_places,
    'heat_count',v_heat_count,
    'qualification_window_start_date',e.qualification_window_start_date,
    'qualification_window_end_date',e.qualification_window_end_date,
    'final_date',e.final_date,
    'decision_deadline',e.participation_decision_deadline,
    'status','ranking_frozen'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_national_championship_planning_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_season integer;
  v_game_date date;
  v_inserted integer := 0;
  v_frozen integer := 0;
  r record;
begin
  select gs.season_number,
         public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_game_date
  from public.game_state gs
  where gs.id = true;

  v_inserted := public.ensure_national_championship_editions_for_season_v1(v_season);

  for r in
    select id
    from public.national_championship_editions
    where season_number = v_season
      and discipline = 'road'
      and status = 'planned'
      and ranking_snapshot_date <= v_game_date
    order by ranking_snapshot_date,country_code
  loop
    perform public.freeze_national_championship_ranking_v1(r.id);
    v_frozen := v_frozen + 1;
  end loop;

  return jsonb_build_object(
    'season_number',v_season,
    'game_date',v_game_date,
    'editions_created',v_inserted,
    'rankings_frozen',v_frozen
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_sync_race_participants_v1(p_edition_id uuid, p_event_type text, p_heat_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  v_race_id uuid;
  v_stage_id uuid;
  v_rider_count integer := 0;
  v_team_count integer := 0;
begin
  select * into e
  from public.national_championship_editions
  where id = p_edition_id;

  if e.id is null then
    raise exception 'National championship edition not found: %', p_edition_id;
  end if;

  if p_event_type = 'qualification' then
    select * into h
    from public.national_championship_heats
    where id = p_heat_id and edition_id = e.id;

    if h.id is null or h.race_id is null then
      raise exception 'Qualification heat/race not found for edition %', p_edition_id;
    end if;

    v_race_id := h.race_id;
  elsif p_event_type = 'final' then
    v_race_id := e.final_race_id;
    if v_race_id is null then
      raise exception 'Final race is not created for edition %', p_edition_id;
    end if;
  else
    raise exception 'Invalid national championship event type: %', p_event_type;
  end if;

  select s.id into v_stage_id
  from public.race_stages s
  where s.race_id = v_race_id
  order by s.stage_number
  limit 1;

  if v_stage_id is null then
    raise exception 'National championship race % has no stage', v_race_id;
  end if;

  if exists (
    select 1
    from public.race_stage_simulation_runs sr
    where sr.stage_id = v_stage_id
      and sr.status in ('running','completed')
  ) then
    return jsonb_build_object(
      'status','participants_locked',
      'race_id',v_race_id,
      'stage_id',v_stage_id
    );
  end if;

  /*
   * Create a zero-cost, organizer-managed preparation shell for each real club
   * represented in the event. No staff, assets or club supplies are attached.
   * The shell exists only so the universal race engine can read rider equipment
   * and rider-specific tactics through its normal stage-plan adapters.
   */
  insert into public.race_preparations (
    race_id,
    club_id,
    status,
    startlist_status,
    setup_window_opens_on,
    rider_submission_deadline_on,
    submitted_at,
    rider_count,
    staff_count,
    participation_cost_cash,
    travel_cost_cash,
    staff_travel_cost_cash,
    asset_transport_cost_cash,
    supplies_cost_cash,
    operations_cost_cash,
    total_cost_cash,
    cost_breakdown_json,
    team_policies_snapshot_json,
    validation_snapshot_json,
    engine_payload_json,
    metadata,
    participating_club_id
  )
  select
    v_race_id,
    x.club_id,
    'submitted',
    'submitted',
    e.ranking_snapshot_date,
    case when p_event_type='qualification' then e.qualification_date else e.final_date end,
    now(),
    x.rider_count,
    0,
    0,0,0,0,0,0,0,
    jsonb_build_object('national_championship',true,'organizer_paid',true),
    '{}'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'standardized_bonus_totals',jsonb_build_object(
        'race_support',0,
        'fatigue_control',0,
        'recovery_support',0,
        'health_protection',0,
        'mechanical_reliability',0
      )
    ),
    jsonb_build_object(
      'national_championship',true,
      'participating_club_id',x.club_id
    ),
    jsonb_build_object(
      'national_championship',true,
      'preparation_mode','rider_equipment_and_individual_tactics_only',
      'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true)
    ),
    x.club_id
  from (
    select
      en.club_id_snapshot as club_id,
      count(*)::int as rider_count
    from public.national_championship_entries en
    where en.edition_id = e.id
      and en.club_id_snapshot is not null
      and (
        (p_event_type='qualification'
          and en.heat_id = p_heat_id
          and en.entry_status='qualification_assigned')
        or
        (p_event_type='final'
          and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
      )
    group by en.club_id_snapshot
  ) x
  on conflict (race_id,club_id) do update
    set rider_count=excluded.rider_count,
        participating_club_id=excluded.participating_club_id,
        metadata=public.race_preparations.metadata || excluded.metadata,
        engine_payload_json=public.race_preparations.engine_payload_json || excluded.engine_payload_json,
        validation_snapshot_json=excluded.validation_snapshot_json,
        updated_at=now();

  /*
   * The universal race engine expects canonical selected riders on each
   * preparation. National Championships use the club only as a technical
   * preparation owner; sporting identity stays rider-only.
   */
  delete from public.race_preparation_riders selected
  using public.race_preparations rp
  where selected.race_preparation_id = rp.id
    and rp.race_id = v_race_id
    and coalesce((rp.metadata->>'national_championship')::boolean,false)
    and not exists (
      select 1
      from public.national_championship_entries en
      where en.edition_id=e.id
        and en.rider_id=selected.rider_id
        and en.club_id_snapshot=rp.club_id
        and (
          (p_event_type='qualification'
            and en.heat_id=p_heat_id
            and en.entry_status='qualification_assigned')
          or
          (p_event_type='final'
            and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
        )
    );

  insert into public.race_preparation_riders (
    race_preparation_id,
    rider_id,
    start_number,
    race_role,
    default_equipment_setup_id,
    availability_snapshot_json,
    rider_snapshot_json,
    bonus_snapshot_json,
    metadata
  )
  select
    rp.id,
    en.rider_id,
    en.national_rank,
    'free_role',
    plan.equipment_setup_id,
    jsonb_build_object(
      'availability_status',r.availability_status,
      'unavailable_until',r.unavailable_until,
      'unavailable_reason',r.unavailable_reason
    ),
    jsonb_build_object(
      'national_championship',true,
      'individual_only',true,
      'national_rank',en.national_rank,
      'overall',r.overall,
      'role',r.role
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'individual_only',true,
      'event_type',p_event_type
    )
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  join public.race_preparations rp
    on rp.race_id=v_race_id
   and rp.club_id=en.club_id_snapshot
  left join public.national_championship_rider_plans plan
    on plan.edition_id=e.id
   and plan.rider_id=en.rider_id
   and plan.event_type=p_event_type
  where en.edition_id=e.id
    and en.club_id_snapshot is not null
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
    )
  on conflict (race_preparation_id,rider_id) do update
    set start_number=excluded.start_number,
        race_role='free_role',
        default_equipment_setup_id=excluded.default_equipment_setup_id,
        availability_snapshot_json=excluded.availability_snapshot_json,
        rider_snapshot_json=excluded.rider_snapshot_json,
        bonus_snapshot_json=excluded.bonus_snapshot_json,
        metadata=public.race_preparation_riders.metadata || excluded.metadata,
        updated_at=now();

  insert into public.race_stage_plans (
    race_preparation_id,
    race_id,
    stage_id,
    stage_number,
    stage_date,
    status,
    opens_on_game_date,
    locks_on_game_date,
    submitted_at,
    stage_objective,
    team_strategy,
    risk_level,
    stage_profile_snapshot_json,
    bonus_snapshot_json,
    engine_stage_payload_json,
    metadata,
    rider_equipment_json,
    rider_roles_json,
    team_tactic_json,
    rider_supplies_json,
    rider_individual_tactics_json,
    last_saved_at,
    last_saved_game_ts
  )
  select
    rp.id,
    v_race_id,
    v_stage_id,
    1,
    s.stage_date,
    'submitted',
    e.ranking_snapshot_date,
    s.stage_date,
    now(),
    'balanced',
    'balanced',
    'normal',
    to_jsonb(s),
    '{}'::jsonb,
    jsonb_build_object('national_championship',true),
    jsonb_build_object(
      'national_championship',true,
      'team_strategy_locked','balanced',
      'staff_assets_supplies_locked',true
    ),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object('plan','balanced','notes','National Championship: individual tactics only'),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    public.get_current_game_ts_local()
  from public.race_preparations rp
  join public.race_stages s on s.id=v_stage_id
  where rp.race_id=v_race_id
    and coalesce((rp.metadata->>'national_championship')::boolean,false)
  on conflict (race_preparation_id,stage_number) do update
    set stage_id=excluded.stage_id,
        stage_date=excluded.stage_date,
        status='submitted',
        team_strategy='balanced',
        team_tactic_json=excluded.team_tactic_json,
        metadata=public.race_stage_plans.metadata || excluded.metadata,
        updated_at=now();

  insert into public.race_stage_plan_riders (
    race_stage_plan_id,
    rider_id,
    stage_role,
    tactic,
    risk_level,
    effort_level,
    equipment_setup_id,
    rider_stage_snapshot_json,
    equipment_bonus_snapshot_json,
    final_bonus_snapshot_json,
    metadata
  )
  select
    sp.id,
    en.rider_id,
    'free_role',
    'balanced',
    'normal',
    'normal',
    plan.equipment_setup_id,
    jsonb_build_object(
      'national_championship',true,
      'national_rank',en.national_rank,
      'event_type',p_event_type
    ),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object('national_championship',true)
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  join public.race_preparations rp
    on rp.race_id=v_race_id
   and rp.club_id=en.club_id_snapshot
  join public.race_stage_plans sp
    on sp.race_preparation_id=rp.id
   and sp.stage_id=v_stage_id
  left join public.national_championship_rider_plans plan
    on plan.edition_id=e.id
   and plan.rider_id=en.rider_id
   and plan.event_type=p_event_type
  where en.edition_id=e.id
    and en.club_id_snapshot is not null
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
    )
  on conflict (race_stage_plan_id,rider_id) do update
    set stage_role='free_role',
        tactic='balanced',
        equipment_setup_id=excluded.equipment_setup_id,
        rider_stage_snapshot_json=public.race_stage_plan_riders.rider_stage_snapshot_json || excluded.rider_stage_snapshot_json,
        metadata=public.race_stage_plan_riders.metadata || excluded.metadata,
        updated_at=now();

  /*
   * Apply saved per-rider commands to the universal stage-plan JSON.
   */
  update public.race_stage_plans sp
  set rider_individual_tactics_json = coalesce((
        select jsonb_object_agg(
          en.rider_id::text,
          jsonb_build_object(
            'phase_1',jsonb_build_object('command',coalesce(plan.phase_1_command,'ride_naturally')),
            'phase_2',jsonb_build_object('command',coalesce(plan.phase_2_command,'ride_naturally')),
            'phase_3',jsonb_build_object('command',coalesce(plan.phase_3_command,'ride_naturally')),
            'phase_4',jsonb_build_object('command',coalesce(plan.phase_4_command,'ride_naturally'))
          )
        )
        from public.national_championship_entries en
        left join public.national_championship_rider_plans plan
          on plan.edition_id=e.id
         and plan.rider_id=en.rider_id
         and plan.event_type=p_event_type
        where en.edition_id=e.id
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
          )
      ),'{}'::jsonb),
      rider_roles_json = coalesce((
        select jsonb_object_agg(en.rider_id::text,to_jsonb('free_role'::text))
        from public.national_championship_entries en
        where en.edition_id=e.id
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
          )
      ),'{}'::jsonb),
      rider_equipment_json = coalesce((
        select jsonb_object_agg(
          en.rider_id::text,
          case when plan.equipment_setup_id is null then 'null'::jsonb
               else to_jsonb(plan.equipment_setup_id::text) end
        )
        from public.national_championship_entries en
        left join public.national_championship_rider_plans plan
          on plan.edition_id=e.id
         and plan.rider_id=en.rider_id
         and plan.event_type=p_event_type
        where en.edition_id=e.id
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
          )
      ),'{}'::jsonb),
      team_strategy='balanced',
      team_tactic_json=jsonb_build_object(
        'plan','balanced',
        'internal_neutral_placeholder',true,
        'team_commands_enabled',false,
        'notes','National Championship: every rider competes independently'
      ),
      rider_supplies_json = coalesce((
        select jsonb_object_agg(
          en.rider_id::text,
          jsonb_build_object('source','organizer','standardized',true)
        )
        from public.national_championship_entries en
        where en.edition_id=e.id
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
          )
      ),'{}'::jsonb),
      metadata=coalesce(sp.metadata,'{}'::jsonb) || jsonb_build_object(
        'national_championship',true,
        'individual_only',true,
        'team_commands_enabled',false
      ),
      updated_at=now()
  from public.race_preparations rp
  where sp.race_preparation_id=rp.id
    and rp.race_id=v_race_id
    and sp.stage_id=v_stage_id
    and coalesce((rp.metadata->>'national_championship')::boolean,false);

  /*
   * Rebuild the canonical participant snapshot after preparation triggers.
   */
  delete from public.race_participant_riders where race_id=v_race_id;
  delete from public.race_participant_teams where race_id=v_race_id;

  insert into public.race_participant_teams (
    race_id,
    team_id,
    status,
    team_name_snapshot,
    logo_url_snapshot,
    country_code_snapshot,
    ranking_snapshot,
    submitted_at,
    accepted_at
  )
  select
    v_race_id,
    en.rider_id,
    'accepted',
    en.rider_name_snapshot,
    null,
    en.country_code_snapshot,
    en.national_rank,
    now(),
    now()
  from public.national_championship_entries en
  where en.edition_id=e.id
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
    )
  order by en.national_rank;

  insert into public.race_participant_riders (
    race_id,
    team_id,
    rider_id,
    rider_name_snapshot,
    team_name_snapshot,
    country_code_snapshot,
    age_snapshot,
    is_young_rider,
    start_number,
    role_snapshot,
    overall_snapshot,
    can_view_exact_overall,
    overall_range_label
  )
  select
    v_race_id,
    en.rider_id,
    en.rider_id,
    en.rider_name_snapshot,
    en.rider_name_snapshot,
    en.country_code_snapshot,
    greatest(
      0,
      extract(year from age(
        case when p_event_type='qualification' then e.qualification_date else e.final_date end,
        r.birth_date
      ))::int
    ),
    extract(year from age(
      case when p_event_type='qualification' then e.qualification_date else e.final_date end,
      r.birth_date
    ))::int <= 21,
    en.national_rank,
    r.role::text,
    r.overall,
    true,
    null
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  left join public.clubs c on c.id=en.club_id_snapshot
  where en.edition_id=e.id
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
    )
  order by en.national_rank;

  select count(*)::int,count(distinct team_id)::int
  into v_rider_count,v_team_count
  from public.race_participant_riders
  where race_id=v_race_id;

  return jsonb_build_object(
    'status','participants_synced',
    'edition_id',e.id,
    'event_type',p_event_type,
    'heat_id',p_heat_id,
    'race_id',v_race_id,
    'stage_id',v_stage_id,
    'rider_count',v_rider_count,
    'team_count',v_team_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_ensure_event_race_v1(p_edition_id uuid, p_event_type text, p_heat_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  src public.race_stages%rowtype;
  v_source_stage_id uuid;
  v_source_race_id uuid;
  v_race_id uuid;
  v_stage_id uuid;
  v_date date;
  v_country_name text;
  v_name text;
  v_region text;
  v_hour integer;
  v_minute integer := 0;
  v_host_city text;
  v_daytime_temp numeric;
  v_avg_temp numeric;
  v_max_temp numeric;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id
  for update;

  if e.id is null then
    raise exception 'National championship edition not found: %',p_edition_id;
  end if;

  if e.climate_status<>'ready' then
    raise exception 'National championship climate window is not ready for %',e.country_code;
  end if;

  if e.route_status<>'ready' then
    raise exception 'National championship requires two suitable road stages for % (route_status=%)',e.country_code,e.route_status;
  end if;

  select coalesce(c.name,e.country_code)
  into v_country_name
  from public.countries c
  where c.code=e.country_code;
  v_country_name:=coalesce(v_country_name,e.country_code);

  if p_event_type='qualification' then
    select * into h
    from public.national_championship_heats
    where id=p_heat_id and edition_id=e.id
    for update;

    if h.id is null then
      raise exception 'Qualification heat not found: %',p_heat_id;
    end if;

    if h.race_id is not null then
      perform public.national_championship_sync_race_participants_v1(e.id,'qualification',h.id);
      return h.race_id;
    end if;

    v_source_stage_id:=e.qualification_source_stage_id;
    v_date:=h.qualification_date;
    v_name:=v_country_name||' National Qualification — Group '||h.heat_number;
  elsif p_event_type='final' then
    if e.final_race_id is not null then
      perform public.national_championship_sync_race_participants_v1(e.id,'final',null);
      return e.final_race_id;
    end if;

    v_source_stage_id:=e.final_source_stage_id;
    v_date:=e.final_date;
    v_name:=v_country_name||' National Road Championship';
  else
    raise exception 'Invalid national championship event type: %',p_event_type;
  end if;

  if v_source_stage_id is null then
    raise exception 'No source stage selected for % national championship %',e.country_code,p_event_type;
  end if;

  select * into src
  from public.race_stages
  where id=v_source_stage_id;

  if src.id is null then
    raise exception 'Source stage not found: %',v_source_stage_id;
  end if;

  v_source_race_id:=src.race_id;
  v_host_city:=coalesce(
    nullif(src.host_city,''),
    nullif(src.start_city_name,''),
    nullif(src.start_city,''),
    nullif(src.finish_city_name,''),
    nullif(src.finish_city,''),
    v_country_name
  );

  v_region:=public.race_start_region_code_v1(e.country_code);
  v_hour:=case v_region
    when 'apac' then 7
    when 'americas' then 17
    else 13
  end;

  if p_event_type='qualification' then
    v_hour:=v_hour+((h.heat_number-1)/2);
    v_minute:=case when mod(h.heat_number-1,2)=0 then 0 else 30 end;
  end if;

  insert into public.races(
    name,short_name,start_date,end_date,country_code,host_city,
    category,race_type,is_stage_race,stage_count,status,
    profile_image_url,logo_url,description,metadata,
    start_time_region_code,planned_start_hour_number,planned_start_minute,
    planned_start_time_label,planned_start_assigned_at
  )
  values(
    v_name,
    case when p_event_type='final'
      then e.country_code||' NC'
      else e.country_code||' NCQ G'||h.heat_number
    end,
    v_date,v_date,e.country_code,v_host_city,
    case when p_event_type='final' then 'NC' else 'NCQ' end,
    'one_day',false,1,'scheduled',
    null::text,
    'https://flagcdn.com/w320/'||lower(e.country_code)||'.png',
    case when p_event_type='final'
      then 'National road championship on an existing host-country road route.'
      else 'National championship qualification heat on an existing host-country road route.'
    end,
    jsonb_build_object(
      'national_championship',true,
      'edition_id',e.id,
      'event_type',p_event_type,
      'heat_id',case when p_event_type='qualification' then h.id else null end,
      'heat_number',case when p_event_type='qualification' then h.heat_number else null end,
      'country_code',e.country_code,
      'source_stage_id',v_source_stage_id,
      'source_race_id',v_source_race_id,
      'source_competition_identity_hidden',true,
      'display_logo_mode','country_flag',
      'display_country_flag_code',e.country_code,
      'climate_source_country_code',e.climate_source_country_code,
      'climate_week_of_year',e.climate_week_of_year,
      'climate_expected_max_temp_c',e.climate_expected_max_temp_c,
      'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true),
      'preparation_mode','rider_equipment_and_individual_tactics_only',
      'individual_only',true,
      'team_commands_enabled',false,
      'staff_assets_supplies_locked',true,
      'team_cost_cash',0,
      'team_cost_coins',0
    ),
    v_region,v_hour,v_minute,
    lpad(v_hour::text,2,'0')||':'||lpad(v_minute::text,2,'0'),
    now()
  )
  returning id into v_race_id;

  /*
   * Insert first with the climate-source country so the normal weather trigger
   * generates from a populated weekly-normal dataset. Then restore the real
   * host country and retain the climate source explicitly in the snapshot.
   */
  insert into public.race_stages(
    race_id,stage_number,stage_date,name,start_city,finish_city,host_city,
    host_country_code,distance_km,terrain_type,finish_type,is_summit_finish,
    flat_pct,hilly_pct,mountain_pct,cobbled_pct,elevation_gain_m,
    profile_image_url,rules_snapshot,metadata,start_city_name,finish_city_name,
    profile_type,notes,intermediate_sprints_json,mountain_climbs_json,
    start_time_region_code,planned_start_hour_number,planned_start_minute,
    planned_start_time_label,planned_start_assigned_at,stage_format
  )
  values(
    v_race_id,1,v_date,
    case when p_event_type='final'
      then 'National Championship'
      else v_country_name||' National Qualification Group '||h.heat_number
    end,
    coalesce(src.start_city,src.start_city_name),
    coalesce(src.finish_city,src.finish_city_name),
    v_host_city,
    coalesce(e.climate_source_country_code,e.country_code),
    src.distance_km,
    src.terrain_type,
    src.finish_type,
    coalesce(src.is_summit_finish,false),
    src.flat_pct,src.hilly_pct,src.mountain_pct,src.cobbled_pct,
    src.elevation_gain_m,
    null::text,
    '{}'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'edition_id',e.id,
      'event_type',p_event_type,
      'source_stage_id',v_source_stage_id,
      'source_race_id',v_source_race_id,
      'source_competition_identity_hidden',true,
      'only_start_and_finish_points',true,
      'actual_host_country_code',e.country_code
    ),
    coalesce(src.start_city_name,src.start_city),
    coalesce(src.finish_city_name,src.finish_city),
    src.profile_type,
    'National Championship route using a host-country terrain profile.',
    '[]'::jsonb,
    '[]'::jsonb,
    v_region,v_hour,v_minute,
    lpad(v_hour::text,2,'0')||':'||lpad(v_minute::text,2,'0'),
    now(),
    'road_race'
  )
  returning id into v_stage_id;

  select
    nullif(src2.weather_snapshot->>'avg_temp_c','')::numeric,
    nullif(src2.weather_snapshot->>'avg_max_temp_c','')::numeric
  into v_avg_temp,v_max_temp
  from public.race_stages src2
  where src2.id=v_stage_id;

  v_max_temp:=coalesce(v_max_temp,e.climate_expected_max_temp_c,20.1);
  v_avg_temp:=coalesce(v_avg_temp,greatest(20.1,v_max_temp-5));

  /*
   * These races start in the warm local daytime slot. Represent the start-time
   * temperature between the weekly mean and mean daily high, with a strict
   * >20 C floor only for championship races whose climate window passed.
   */
  v_daytime_temp:=greatest(
    20.1,
    least(
      greatest(v_max_temp,20.1),
      v_avg_temp+(greatest(v_max_temp-v_avg_temp,0)*0.72)
    )
  );

  update public.race_stages
  set
    host_country_code=e.country_code,
    weather_snapshot=coalesce(weather_snapshot,'{}'::jsonb)||jsonb_build_object(
      'country_code',e.country_code,
      'climate_source_country_code',e.climate_source_country_code,
      'national_championship',true,
      'warm_daytime_start',true,
      'race_start_temp_c',round(v_daytime_temp,1),
      'avg_temp_c',round(v_daytime_temp,1)
    ),
    updated_at=now()
  where id=v_stage_id;

  insert into public.race_stage_profile_details(
    stage_id,race_id,stage_title,route_label,stage_summary,weather_summary,
    distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
    profile_points,route_markers,intermediate_sprints,mountain_climbs,
    metadata,weather_snapshot
  )
  select
    v_stage_id,
    v_race_id,
    v_name,
    coalesce(nullif(coalesce(src.start_city_name,src.start_city),''),'Start')
      ||' → '||
    coalesce(nullif(coalesce(src.finish_city_name,src.finish_city),''),'Finish'),
    case
      when lower(coalesce(src.terrain_type,'flat'))='flat'
        then 'National Championship road race on a fast host-country terrain profile.'
      when lower(coalesce(src.terrain_type,'flat'))='hilly'
        then 'National Championship road race on a selective rolling host-country terrain profile.'
      else 'National Championship road race on a balanced host-country terrain profile.'
    end,
    null,
    coalesce(spd.distance_km,src.distance_km),
    coalesce(spd.elevation_gain_m,src.elevation_gain_m,0),
    coalesce(spd.terrain_type,src.terrain_type,'flat'),
    coalesce(spd.profile_type,src.profile_type,'sprinter'),
    coalesce(spd.terrain_split,jsonb_build_object(
      'flat',coalesce(src.flat_pct,0),
      'hilly',coalesce(src.hilly_pct,0),
      'mountain',coalesce(src.mountain_pct,0),
      'cobbled',coalesce(src.cobbled_pct,0)
    )),
    coalesce(spd.profile_points,'[]'::jsonb),
    jsonb_build_array(
      jsonb_build_object(
        'km',0,
        'type','start',
        'label',coalesce(nullif(coalesce(src.start_city_name,src.start_city),''),'Start')
      ),
      jsonb_build_object(
        'km',src.distance_km,
        'type','finish',
        'label',coalesce(nullif(coalesce(src.finish_city_name,src.finish_city),''),'Finish')
      )
    ),
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'source_stage_id',v_source_stage_id,
      'source_competition_identity_hidden',true,
      'only_start_and_finish_points',true,
      'cloned_for_event_type',p_event_type
    ),
    (select weather_snapshot from public.race_stages where id=v_stage_id)
  from public.race_stage_profile_details spd
  where spd.stage_id=v_source_stage_id
  on conflict (stage_id) do nothing;

  if not exists(
    select 1 from public.race_stage_profile_details where stage_id=v_stage_id
  ) then
    insert into public.race_stage_profile_details(
      stage_id,race_id,stage_title,route_label,stage_summary,
      distance_km,elevation_gain_m,terrain_type,profile_type,terrain_split,
      profile_points,route_markers,intermediate_sprints,mountain_climbs,
      metadata,weather_snapshot
    )
    values(
      v_stage_id,v_race_id,v_name,
      coalesce(nullif(coalesce(src.start_city_name,src.start_city),''),'Start')
        ||' → '||
      coalesce(nullif(coalesce(src.finish_city_name,src.finish_city),''),'Finish'),
      'National Championship road race using a host-country terrain profile.',
      coalesce(src.distance_km,0),
      coalesce(src.elevation_gain_m,0),
      coalesce(src.terrain_type,'flat'),
      coalesce(src.profile_type,'sprinter'),
      jsonb_build_object(
        'flat',coalesce(src.flat_pct,0),
        'hilly',coalesce(src.hilly_pct,0),
        'mountain',coalesce(src.mountain_pct,0),
        'cobbled',coalesce(src.cobbled_pct,0)
      ),
      coalesce(
        src.metadata #> '{route_profile_v1,profile_points}',
        src.metadata -> 'profile_points',
        '[]'::jsonb
      ),
      jsonb_build_array(
        jsonb_build_object(
          'km',0,
          'type','start',
          'label',coalesce(nullif(coalesce(src.start_city_name,src.start_city),''),'Start')
        ),
        jsonb_build_object(
          'km',src.distance_km,
          'type','finish',
          'label',coalesce(nullif(coalesce(src.finish_city_name,src.finish_city),''),'Finish')
        )
      ),
      '[]'::jsonb,
      '[]'::jsonb,
      jsonb_build_object(
        'national_championship',true,
        'source_stage_id',v_source_stage_id,
        'source_competition_identity_hidden',true,
        'only_start_and_finish_points',true,
        'cloned_for_event_type',p_event_type
      ),
      (select weather_snapshot from public.race_stages where id=v_stage_id)
    );
  end if;

  perform public.sync_race_stage_points_from_stage_json_v1(v_stage_id,true);

  delete from public.race_stage_points
  where stage_id=v_stage_id
    and upper(point_type) not in ('START','FINISH');

  update public.race_stage_points
  set name=case when upper(point_type)='START' then 'Start' else 'Finish' end,
      points_scheme='[]'::jsonb,
      time_bonus_seconds='[]'::jsonb,
      kom_category=null,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'national_championship',true,
        'only_start_and_finish_points',true
      )
  where stage_id=v_stage_id;

  insert into public.race_entry_rules(
    race_id,race_class_code,target_teams,min_teams,max_teams,
    min_riders_per_team,max_riders_per_team,
    applications_open_game_date,applications_close_game_date,
    applications_status,auto_close_when_full,allow_waitlist,
    prize_fund_cash,prize_fund_source,metadata,
    race_season_number,race_start_month_number,race_start_day_number,
    application_window_policy,rider_submission_deadline
  )
  values(
    v_race_id,'1.1',200,1,200,1,120,
    v_date-1,v_date-1,'closed',true,false,
    0,'manual_override',
    jsonb_build_object(
      'national_championship',true,
      'applications_disabled',true,
      'automatic_entry',true,
      'no_team_cost',true,
      'individual_riders_only',true
    ),
    e.season_number,
    extract(month from v_date)::int,
    extract(day from v_date)::int,
    'standard_90_3',
    v_date
  );

  if p_event_type='qualification' then
    update public.national_championship_heats
    set race_id=v_race_id,status='ready',updated_at=now()
    where id=h.id;
  else
    update public.national_championship_editions
    set final_race_id=v_race_id,updated_at=now()
    where id=e.id;
  end if;

  perform public.national_championship_sync_race_participants_v1(
    e.id,
    p_event_type,
    case when p_event_type='qualification' then h.id else null end
  );

  return v_race_id;
end;
$function$
;

