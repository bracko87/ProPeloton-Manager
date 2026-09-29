-- 1) Preserve the exact Phase 9 supply applier and wrap it with a safe
-- interchangeable durable-unit rebound for unpublished calculations.
do $$
begin
  if to_regprocedure('public.universal_race_stage_apply_phase9_supplies_exact_v1(uuid)') is null then
    if to_regprocedure('public.universal_race_stage_apply_phase9_supplies_v1(uuid)') is null then
      raise exception 'universal_race_stage_apply_phase9_supplies_v1(uuid) is missing';
    end if;
    execute 'alter function public.universal_race_stage_apply_phase9_supplies_v1(uuid) rename to universal_race_stage_apply_phase9_supplies_exact_v1';
  end if;
end
$$;

create or replace function public.universal_race_stage_apply_phase9_supplies_v1(
  p_simulation_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  v_source_input jsonb;
  v_used_alt_ids uuid[] := array[]::uuid[];
  v_remaps jsonb := '[]'::jsonb;
  v_result jsonb;
  v_changed boolean := false;
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
      v_reason := null;
      v_alt_unit_id := null;
      v_existing_applied_resource_id := null;

      -- Reuse an earlier rebound if this helper is ever retried independently.
      select a.resource_id
      into v_existing_applied_resource_id
      from public.race_engine_stage_supply_applications a
      where a.simulation_run_id = p_simulation_run_id
        and a.metadata ->> 'manifest_resource_id' = v_source_resource_id
      order by a.created_at, a.id
      limit 1;

      if v_existing_applied_resource_id is not null then
        v_applied_resource_id := v_existing_applied_resource_id;
        v_alt_unit_id := replace(v_applied_resource_id, 'durable:', '')::uuid;
        v_reason := 'existing_rebound';
      else
        select u.stage_uses_remaining, u.last_used_game_date
        into v_selected_remaining, v_selected_last_used
        from public.club_race_supply_units u
        where u.id = v_selected_unit_id
          and u.club_id = v_club_id
          and u.supply_key = v_supply_key;

        if found and v_uses_needed > 0 and (
          v_selected_last_used = v_stage_date
          or v_selected_remaining < v_uses_needed
        ) then
          v_reason := case
            when v_selected_last_used = v_stage_date
              then 'selected_unit_already_used_same_game_date'
            else 'selected_unit_insufficient_remaining_uses'
          end;

          select alt.id
          into v_alt_unit_id
          from public.club_race_supply_units alt
          where alt.club_id = v_club_id
            and alt.supply_key = v_supply_key
            and alt.status in ('ready','assigned')
            and alt.stage_uses_remaining >= v_uses_needed
            -- A historical catch-up may only borrow a unit whose last use is
            -- chronologically before this stage. Never move inventory history backwards.
            and (alt.last_used_game_date is null or alt.last_used_game_date < v_stage_date)
            and not (alt.id = any(v_used_alt_ids))
            -- Do not steal a unit explicitly selected elsewhere in the immutable manifest.
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
          order by alt.stage_uses_remaining, alt.id
          limit 1;

          if v_alt_unit_id is not null then
            v_applied_resource_id := 'durable:' || v_alt_unit_id::text;
          end if;
        end if;
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
      || jsonb_build_object('durable_resource_rebound_count',0,'durable_resource_rebounds','[]'::jsonb);
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

  -- Restore the immutable hidden calculation snapshot before finalization continues.
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

  return v_result || jsonb_build_object(
    'durable_resource_rebound_count', jsonb_array_length(v_remaps),
    'durable_resource_rebounds', v_remaps,
    'rebound_rule', 'interchangeable_unpublished_durable_supply_units_v1'
  );
end;
$function$;

revoke all on function public.universal_race_stage_apply_phase9_supplies_exact_v1(uuid) from public;
revoke all on function public.universal_race_stage_apply_phase9_supplies_exact_v1(uuid) from anon;
revoke all on function public.universal_race_stage_apply_phase9_supplies_exact_v1(uuid) from authenticated;
revoke all on function public.universal_race_stage_apply_phase9_supplies_v1(uuid) from public;
revoke all on function public.universal_race_stage_apply_phase9_supplies_v1(uuid) from anon;
revoke all on function public.universal_race_stage_apply_phase9_supplies_v1(uuid) from authenticated;
grant execute on function public.universal_race_stage_apply_phase9_supplies_v1(uuid) to service_role;

-- 2) Make the mandatory enforcement use the same canonical effective availability
-- used by UI alerts/advisors, including earlier same-day race reservations.
do $$
begin
  if to_regprocedure('public.universal_race_stage_enforce_mandatory_jerseys_precanonical_v1(uuid)') is null then
    if to_regprocedure('public.universal_race_stage_enforce_mandatory_jerseys_v1(uuid)') is null then
      raise exception 'universal_race_stage_enforce_mandatory_jerseys_v1(uuid) is missing';
    end if;
    execute 'alter function public.universal_race_stage_enforce_mandatory_jerseys_v1(uuid) rename to universal_race_stage_enforce_mandatory_jerseys_precanonical_v1';
  end if;
end
$$;

create or replace function public.universal_race_stage_enforce_mandatory_jerseys_v1(
  p_stage_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_race uuid;
  v_no integer;
  v_date date;
  v_race_name text;
  x record;
  v_req integer;
  v_owner uuid;
  v_owner_total integer;
  v_reserved integer;
  v_avail integer;
  v_missing integer;
  v_ai boolean;
  v_user uuid;
  v_elig jsonb;
  v_new integer := 0;
  v_checked integer := 0;
  v_ai_fill integer := 0;
  v_inserted integer;
  v_decisions jsonb := '[]'::jsonb;
begin
  select s.race_id,s.stage_number,s.stage_date::date,r.name
  into v_race,v_no,v_date,v_race_name
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_stage_id;

  if v_race is null then
    raise exception 'Stage % was not found.',p_stage_id;
  end if;

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
      continue;
    end if;

    v_req := public.universal_race_team_required_jerseys_v1(v_race,x.team_id);
    if v_req <= 0 then continue; end if;

    v_checked := v_checked + 1;
    v_owner := x.resource_owner_club_id;
    if v_owner is null then
      raise exception 'Could not resolve physical resource owner for team %.',x.team_id;
    end if;

    select coalesce(c.is_ai,false) or coalesce(x.is_ai_filler,false),owner.owner_user_id
    into v_ai,v_user
    from public.clubs c
    join public.clubs owner on owner.id=v_owner
    where c.id=x.team_id;

    perform public.sync_race_supply_units_from_summary_v1(v_owner);
    v_elig := public.race_team_stage_eligibility_v1(p_stage_id,x.team_id);
    v_avail := coalesce(nullif(v_elig->>'effective_available_jersey_units','')::integer,0);
    v_reserved := coalesce(nullif(v_elig->>'other_race_reserved_units','')::integer,0);
    v_owner_total := coalesce(nullif(v_elig->>'total_usable_owned_units_before_same_day_rule','')::integer,0);

    if coalesce(v_ai,false) and v_avail < v_req then
      perform public.universal_race_team_ensure_ai_jerseys_v1(
        v_race,x.team_id,greatest(v_req + v_reserved,v_req)
      );
      v_elig := public.race_team_stage_eligibility_v1(p_stage_id,x.team_id);
      v_avail := coalesce(nullif(v_elig->>'effective_available_jersey_units','')::integer,0);
      v_owner_total := coalesce(nullif(v_elig->>'total_usable_owned_units_before_same_day_rule','')::integer,0);
      if v_avail >= v_req then v_ai_fill := v_ai_fill + 1; end if;
    end if;

    if v_avail < v_req then
      v_missing := v_req-v_avail;
      insert into public.race_team_stage_disqualifications(
        race_id,team_id,from_stage_id,from_stage_number,reason_code,
        required_jersey_units,available_jersey_units,missing_jersey_units,
        detected_game_date,metadata
      ) values (
        v_race,x.team_id,p_stage_id,v_no,'mandatory_race_jersey_shortage',
        v_req,v_avail,v_missing,v_date,
        jsonb_build_object(
          'race_name',v_race_name,'team_name',x.club_name,
          'sporting_team_id',x.team_id,'resource_owner_club_id',v_owner,
          'resource_owner_usable_units_before_priority',v_owner_total,
          'other_race_reserved_units',v_reserved,
          'canonical_effective_available_units',v_avail,
          'canonical_eligibility_snapshot',v_elig,
          'rule_version','canonical_effective_race_supply_enforcement_v2',
          'disqualified_from_stage_and_remaining_stages',true,
          'fabricated_results',false
        )
      )
      on conflict (race_id,team_id) do nothing;
      get diagnostics v_inserted=row_count;

      if v_inserted>0 then
        v_new:=v_new+1;
        if v_user is not null and not coalesce(v_ai,false) then
          perform public.create_race_team_jersey_disqualification_notification_v1(
            v_user,v_race,p_stage_id,x.team_id,v_req,v_avail
          );
        end if;
      end if;

      v_decisions:=v_decisions||jsonb_build_array(jsonb_build_object(
        'team_id',x.team_id,'team_name',x.club_name,'resource_owner_club_id',v_owner,
        'status','disqualified','required_jerseys',v_req,
        'owner_usable_jerseys',v_owner_total,'other_race_reserved_jerseys',v_reserved,
        'available_jerseys_after_reservations',v_avail,'missing_jerseys',v_missing,
        'from_stage_number',v_no
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
    'teams_checked',v_checked,'teams_newly_disqualified',v_new,
    'ai_teams_auto_provisioned',v_ai_fill,
    'resource_rule','canonical_effective_race_supply_v2',
    'decisions',v_decisions
  );
end;
$function$;

revoke all on function public.universal_race_stage_enforce_mandatory_jerseys_precanonical_v1(uuid) from public;
revoke all on function public.universal_race_stage_enforce_mandatory_jerseys_precanonical_v1(uuid) from anon;
revoke all on function public.universal_race_stage_enforce_mandatory_jerseys_precanonical_v1(uuid) from authenticated;
revoke all on function public.universal_race_stage_enforce_mandatory_jerseys_v1(uuid) from public;
revoke all on function public.universal_race_stage_enforce_mandatory_jerseys_v1(uuid) from anon;
revoke all on function public.universal_race_stage_enforce_mandatory_jerseys_v1(uuid) from authenticated;
grant execute on function public.universal_race_stage_enforce_mandatory_jerseys_v1(uuid) to service_role;

-- 3) Preserve normal replay timing for future stages, but immediately close the
-- replay gate for genuine historical catch-up stages whose scheduled start is already past.
do $$
begin
  if to_regprocedure('public.universal_race_stage_process_lifecycle_core_v1(integer)') is null then
    if to_regprocedure('public.universal_race_stage_process_lifecycle_v1(integer)') is null then
      raise exception 'universal_race_stage_process_lifecycle_v1(integer) is missing';
    end if;
    execute 'alter function public.universal_race_stage_process_lifecycle_v1(integer) rename to universal_race_stage_process_lifecycle_core_v1';
  end if;
end
$$;

create or replace function public.universal_race_stage_process_lifecycle_v1(
  p_max_publications integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_first jsonb;
  v_second jsonb := '{}'::jsonb;
  v_current_game_at timestamp without time zone;
  v_fast_forwarded integer := 0;
  v_first_published integer := 0;
  v_second_published integer := 0;
begin
  v_first := public.universal_race_stage_process_lifecycle_core_v1(p_max_publications);

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  update public.race_stage_automation_state state
  set details = coalesce(state.details,'{}'::jsonb) || jsonb_build_object(
        'replay_closes_at_real',clock_timestamp(),
        'historical_catchup_replay_fast_forwarded',true,
        'historical_catchup_fast_forwarded_at_real',clock_timestamp(),
        'historical_catchup_current_game_at',v_current_game_at
      ),
      last_checked_at=clock_timestamp(),
      updated_at=clock_timestamp()
  from public.race_stage_simulation_runs run
  where run.id=state.simulation_run_id
    and state.last_status='replay_live'
    and state.scheduled_game_at < v_current_game_at
    and run.status='running'
    and run.engine_version='race_engine_ts_v1'
    and run.simulation_mode='deterministic_road_race_v1'
    and coalesce(run.result_summary_json->>'calculation_contract','')='universal_phase11b_calculated_hidden_v1'
    and not exists (
      select 1 from public.race_stage_authoritative_runs a where a.stage_id=state.stage_id
    )
    and (
      nullif(state.details->>'replay_closes_at_real','') is null
      or (state.details->>'replay_closes_at_real')::timestamptz > clock_timestamp()
    );
  get diagnostics v_fast_forwarded=row_count;

  if v_fast_forwarded>0 then
    v_second := public.universal_race_stage_process_lifecycle_core_v1(
      greatest(coalesce(p_max_publications,4),v_fast_forwarded)
    );
  end if;

  v_first_published := coalesce(nullif(v_first->>'published_count','')::integer,0);
  v_second_published := coalesce(nullif(v_second->>'published_count','')::integer,0);

  return jsonb_build_object(
    'status','completed',
    'current_game_at',v_current_game_at,
    'historical_catchup_fast_forwarded_count',v_fast_forwarded,
    'published_count',v_first_published+v_second_published,
    'first_pass',v_first,
    'catchup_pass',v_second,
    'historical_catchup_rule','past_stage_start_only_v1'
  );
end;
$function$;

revoke all on function public.universal_race_stage_process_lifecycle_core_v1(integer) from public;
revoke all on function public.universal_race_stage_process_lifecycle_core_v1(integer) from anon;
revoke all on function public.universal_race_stage_process_lifecycle_core_v1(integer) from authenticated;
revoke all on function public.universal_race_stage_process_lifecycle_v1(integer) from public;
revoke all on function public.universal_race_stage_process_lifecycle_v1(integer) from anon;
revoke all on function public.universal_race_stage_process_lifecycle_v1(integer) from authenticated;
grant execute on function public.universal_race_stage_process_lifecycle_v1(integer) to service_role;