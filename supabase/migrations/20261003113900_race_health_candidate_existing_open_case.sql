-- Carry a still-open stage-race injury into the next health case instead of
-- violating the one-open-case-per-rider invariant during official publication.
CREATE OR REPLACE FUNCTION public.universal_race_stage_apply_health_candidates_v1(p_simulation_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_manifest jsonb;
  v_row jsonb;
  v_rider_id uuid;
  v_team_id uuid;
  v_case_code text;
  v_incident_id text;
  v_severity text;
  v_health_case_id uuid;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_created integer := 0;
  v_existing integer := 0;
  v_transient integer := 0;
  v_nonblocking integer := 0;
  v_prevented_by_health_protection integer := 0;
  v_health_incident_risk_multiplier numeric := 1;
  v_health_consequence_roll numeric := 0;
  v_old_availability text;
  v_new_availability text;
  v_minor_persistent integer := 0;
  v_prior_case public.rider_health_cases%rowtype;
  v_prior_incident jsonb;
begin
  select * into v_run
  from public.race_stage_simulation_runs run
  where run.id = p_simulation_run_id
  for update;

  if not found then
    raise exception 'Unknown simulation run %', p_simulation_run_id;
  end if;

  v_manifest := coalesce(
    v_run.result_summary_json -> 'application_manifest',
    '{}'::jsonb
  );

  for v_row in
    select item
    from jsonb_array_elements(
      coalesce(v_manifest -> 'healthCaseCandidates', '[]'::jsonb)
    ) item
    order by item ->> 'riderId', item ->> 'incidentId'
  loop
    v_rider_id := nullif(v_row ->> 'riderId', '')::uuid;
    v_team_id := nullif(v_row ->> 'teamId', '')::uuid;
    v_case_code := nullif(v_row ->> 'caseCode', '');
    v_incident_id := coalesce(v_row ->> 'incidentId', '');
    v_severity := lower(coalesce(nullif(v_row ->> 'severity', ''), 'moderate'));

    if v_rider_id is null or v_team_id is null or v_case_code is null then
      raise exception 'Incomplete Phase 10 health candidate: %', v_row;
    end if;

    if v_severity not in ('minor', 'moderate', 'major') then
      raise exception 'Unsupported Phase 10 health severity % for %', v_severity, v_row;
    end if;

    if exists (
      select 1
      from public.rider_health_case_context_v1 context
      where context.rider_id = v_rider_id
        and (
          (
            context.source_type = 'race'
            and context.source_id = v_run.stage_id
            and context.case_code = public.health_normalize_case_code_v1(v_case_code)
            and coalesce(context.notes ->> 'phase11_incident_id', '') = v_incident_id
          )
          or coalesce(context.notes -> 'merged_race_incidents', '[]'::jsonb)
             @> jsonb_build_array(jsonb_build_object(
               'stage_id', v_run.stage_id, 'incident_id', v_incident_id
             ))
        )
    ) then
      v_existing := v_existing + 1;
      continue;
    end if;

    -- Minor race injuries persist as short, non-blocking health cases.
    -- The rider may continue racing, but remains not fully fit and receives
    -- the normal daily health-condition/sharpness consequences until recovery.

    select coalesce(min(modifier.health_incident_risk_multiplier), 1::numeric)
    into v_health_incident_risk_multiplier
    from public.race_engine_get_stage_rider_preparation_modifiers_v2(v_run.stage_id) modifier
    where modifier.rider_id = v_rider_id
      and modifier.team_id = v_team_id;

    v_health_incident_risk_multiplier := greatest(0.78::numeric, least(1::numeric, coalesce(v_health_incident_risk_multiplier, 1::numeric)));
    v_health_consequence_roll := public.race_engine_hash_roll_v1(
      p_simulation_run_id::text || ':' || v_rider_id::text || ':' || v_incident_id || ':health_consequence'
    );

    if v_health_incident_risk_multiplier < 1::numeric
       and v_health_consequence_roll >= v_health_incident_risk_multiplier then
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'status', 'health_consequence_prevented_by_preparation',
          'rider_id', v_rider_id,
          'team_id', v_team_id,
          'case_code', v_case_code,
          'severity', v_severity,
          'stage_id', v_run.stage_id,
          'incident_id', v_incident_id,
          'health_incident_risk_multiplier', v_health_incident_risk_multiplier,
          'health_consequence_roll', v_health_consequence_roll,
          'persistent_health_case_created', false,
          'next_stage_selection_blocked', false,
          'medical_health_protection_live', true
        )
      );
      v_prevented_by_health_protection := v_prevented_by_health_protection + 1;
      continue;
    end if;

    select coalesce(rider.availability_status, 'fit')
    into v_old_availability
    from public.riders rider
    where rider.id = v_rider_id;

    -- A stage race can injure a rider who is still recovering from an earlier
    -- stage. Preserve that case and its deadline before opening a new one.
    select * into v_prior_case
    from public.rider_health_cases hc
    where hc.rider_id = v_rider_id
      and hc.status in ('active', 'recovering')
    for update;

    if found then
      v_prior_incident := jsonb_build_object(
        'stage_id', v_run.stage_id,
        'incident_id', v_incident_id,
        'case_code', v_case_code,
        'severity', v_severity,
        'simulation_run_id', p_simulation_run_id
      );

      if case v_prior_case.severity
           when 'major' then 3 when 'moderate' then 2 else 1 end
         > case v_severity
           when 'major' then 3 when 'moderate' then 2 else 1 end then
        -- Keep the stronger case active; retain the additional race incident
        -- in its existing medical record so a retry is idempotent.
        update public.rider_health_cases hc
        set notes = coalesce(hc.notes, '{}'::jsonb) || jsonb_build_object(
          'merged_race_incidents',
          coalesce(hc.notes -> 'merged_race_incidents', '[]'::jsonb)
            || jsonb_build_array(v_prior_incident)
        )
        where hc.id = v_prior_case.id;
        update public.rider_health_case_context_v1 context
        set notes = coalesce(context.notes, '{}'::jsonb) || jsonb_build_object(
          'merged_race_incidents',
          coalesce(context.notes -> 'merged_race_incidents', '[]'::jsonb)
            || jsonb_build_array(v_prior_incident)
        )
        where context.health_case_id = v_prior_case.id;
        v_existing := v_existing + 1;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'status', 'merged_into_stronger_open_case',
          'health_case_id', v_prior_case.id,
          'rider_id', v_rider_id,
          'incident_id', v_incident_id
        ));
        continue;
      end if;

      update public.rider_health_cases hc
      set status = 'resolved',
          resolved_on = (select stage_date from public.race_stages where id=v_run.stage_id),
          notes = coalesce(hc.notes, '{}'::jsonb) || jsonb_build_object(
            'superseded_by_race_stage', v_run.stage_id,
            'superseded_by_incident_id', v_incident_id,
            'previous_recovery_until', hc.recovery_until
          )
      where hc.id = v_prior_case.id;
    end if;

    v_result := public.health_create_rider_case_v1(
      v_rider_id,
      v_team_id,
      v_case_code,
      v_severity,
      'race',
      v_run.stage_id,
      nullif(v_row ->> 'bodyPart', ''),
      (
        select stage.stage_date::date
        from public.race_stages stage
        where stage.id = v_run.stage_id
      ),
      coalesce(v_row -> 'notes', '{}'::jsonb)
        || jsonb_build_object(
          'phase11_incident_id', v_incident_id,
          'phase11_simulation_run_id', p_simulation_run_id,
          'phase11_source_type', 'race_stage_incident',
          'selection_blocked_after_stage',
            coalesce((v_row ->> 'selectionBlockedAfterStage')::boolean, false),
          'phase11e_attrition_balance', true
        )
    );

    v_health_case_id := nullif(v_result ->> 'health_case_id', '')::uuid;

    if v_prior_case.id is not null then
      update public.rider_health_cases hc
      set active_until = greatest(hc.active_until, v_prior_case.active_until),
          recovery_until = greatest(hc.recovery_until, v_prior_case.recovery_until),
          selection_blocked = hc.selection_blocked or v_prior_case.selection_blocked,
          training_blocked = hc.training_blocked or v_prior_case.training_blocked,
          development_blocked = hc.development_blocked or v_prior_case.development_blocked,
          notes = coalesce(hc.notes, '{}'::jsonb) || jsonb_build_object(
            'supersedes_health_case_id', v_prior_case.id,
            'previous_case_code', v_prior_case.case_code,
            'previous_recovery_until', v_prior_case.recovery_until
          )
      where hc.id = v_health_case_id;
      update public.rider_health_case_context_v1 context
      set expected_full_recovery_on = greatest(
            context.expected_full_recovery_on, v_prior_case.recovery_until
          ),
          notes = coalesce(context.notes, '{}'::jsonb) || jsonb_build_object(
            'supersedes_health_case_id', v_prior_case.id,
            'previous_case_code', v_prior_case.case_code,
            'previous_recovery_until', v_prior_case.recovery_until
          )
      where context.health_case_id = v_health_case_id;
      update public.riders rider
      set unavailable_until = greatest(rider.unavailable_until, v_prior_case.recovery_until)
      where rider.id = v_rider_id;
    end if;

    if v_severity in ('minor', 'moderate') then
      -- Minor and moderate cases remain selectable. Minor cases are lighter:
      -- they do not block training/development, while moderate cases keep the
      -- catalogue's normal training/development restrictions.
      update public.rider_health_cases hc
      set selection_blocked = (v_prior_case.id is not null and v_prior_case.selection_blocked),
          training_blocked = case when v_severity = 'minor' then false else hc.training_blocked end,
          development_blocked = case when v_severity = 'minor' then false else hc.development_blocked end
      where hc.id = v_health_case_id;

      update public.riders rider
      set availability_status = 'not_fully_fit',
          unavailable_until = null,
          unavailable_reason = null
      where rider.id = v_rider_id;

      v_result := v_result || jsonb_build_object(
        'next_stage_selection_blocked', false,
        'rider_availability_after_handoff', 'not_fully_fit',
        'minor_persistent_nonblocking', (v_severity = 'minor'),
        'phase11e_balance', true
      );

      if v_severity = 'minor' then
        v_minor_persistent := v_minor_persistent + 1;
      else
        v_nonblocking := v_nonblocking + 1;
      end if;
    else
      -- Major injury remains the genuine stage-race attrition path.
      v_result := v_result || jsonb_build_object(
        'next_stage_selection_blocked', true,
        'phase11e_balance', true
      );
    end if;

    select coalesce(rider.availability_status, 'fit')
    into v_new_availability
    from public.riders rider
    where rider.id = v_rider_id;

    begin
      perform public.notify_rider_status_transition(
        v_rider_id,
        (select stage.stage_date::date from public.race_stages stage where stage.id = v_run.stage_id),
        coalesce(v_old_availability, 'fit'),
        coalesce(v_new_availability, 'fit'),
        coalesce((select rider.fatigue from public.riders rider where rider.id = v_rider_id), 0),
        (select rider.unavailable_until from public.riders rider where rider.id = v_rider_id),
        (select rider.unavailable_reason from public.riders rider where rider.id = v_rider_id)
      );
    exception
      when others then
        raise warning 'race health status notification failed for rider %: %', v_rider_id, sqlerrm;
    end;

    v_results := v_results || jsonb_build_array(v_result);
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'simulation_run_id', p_simulation_run_id,
    'created_count', v_created,
    'already_applied_count', v_existing,
    'transient_minor_count', v_transient,
    'persistent_minor_count', v_minor_persistent,
    'prevented_by_health_protection_count', v_prevented_by_health_protection,
    'moderate_selectable_count', v_nonblocking,
    'results', v_results,
    'balance_version', 'phase11f_medical_health_protection_v1'
  );
end;
$function$
;
