
do $patch$
declare
  v_oid oid;
  v_def text;
  v_new text;
  v_minor_old text;
  v_minor_new text;
  v_create_old text;
  v_create_new text;
  v_branch_old text;
  v_branch_new text;
  v_return_old text;
  v_return_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='universal_race_stage_apply_health_candidates_v1'
  order by p.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'universal_race_stage_apply_health_candidates_v1 not found';
  end if;

  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

  v_new := replace(
    v_def,
    '  v_health_consequence_roll numeric := 0;',
    E'  v_health_consequence_roll numeric := 0;\n  v_old_availability text;\n  v_new_availability text;\n  v_minor_persistent integer := 0;'
  );

  v_minor_old := $old$
    -- Minor race injuries are already represented by the authoritative
    -- stage incident, energy loss, time loss and performance penalty.
    -- They must not automatically remove a rider from the next stage.
    if v_severity = 'minor' then
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'status', 'transient_race_injury',
          'rider_id', v_rider_id,
          'team_id', v_team_id,
          'case_code', v_case_code,
          'severity', v_severity,
          'stage_id', v_run.stage_id,
          'incident_id', v_incident_id,
          'persistent_health_case_created', false,
          'next_stage_selection_blocked', false,
          'phase11e_balance', true
        )
      );
      v_transient := v_transient + 1;
      continue;
    end if;
$old$;

  v_minor_new := $new$
    -- Minor race injuries persist as short, non-blocking health cases.
    -- The rider may continue racing, but remains not fully fit and receives
    -- the normal daily health-condition/sharpness consequences until recovery.
$new$;

  if strpos(v_new, v_minor_old) = 0 then
    raise exception 'minor injury patch point not found';
  end if;
  v_new := replace(v_new, v_minor_old, v_minor_new);

  v_create_old := $old$
    v_result := public.health_create_rider_case_v1(
$old$;
  v_create_new := $new$
    select coalesce(rider.availability_status, 'fit')
    into v_old_availability
    from public.riders rider
    where rider.id = v_rider_id;

    v_result := public.health_create_rider_case_v1(
$new$;
  v_new := replace(v_new, v_create_old, v_create_new);

  v_branch_old := $old$
    if v_severity = 'moderate' then
      -- Keep a real medical case, training/development consequences and
      -- recovery timeline, but permit the rider to continue the stage race.
      update public.rider_health_cases hc
      set selection_blocked = false
      where hc.id = v_health_case_id;

      update public.riders rider
      set availability_status = 'not_fully_fit',
          unavailable_until = null,
          unavailable_reason = null
      where rider.id = v_rider_id;

      v_result := v_result || jsonb_build_object(
        'next_stage_selection_blocked', false,
        'rider_availability_after_handoff', 'not_fully_fit',
        'phase11e_balance', true
      );
      v_nonblocking := v_nonblocking + 1;
    else
      -- Major injury remains the genuine stage-race attrition path.
      v_result := v_result || jsonb_build_object(
        'next_stage_selection_blocked', true,
        'phase11e_balance', true
      );
    end if;

    v_results := v_results || jsonb_build_array(v_result);
    v_created := v_created + 1;
$old$;

  v_branch_new := $new$
    if v_severity in ('minor', 'moderate') then
      -- Minor and moderate cases remain selectable. Minor cases are lighter:
      -- they do not block training/development, while moderate cases keep the
      -- catalogue's normal training/development restrictions.
      update public.rider_health_cases hc
      set selection_blocked = false,
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
$new$;

  if strpos(v_new, v_branch_old) = 0 then
    raise exception 'nonblocking health branch patch point not found';
  end if;
  v_new := replace(v_new, v_branch_old, v_branch_new);

  v_return_old := $old$
    'transient_minor_count', v_transient,
    'prevented_by_health_protection_count', v_prevented_by_health_protection,
$old$;
  v_return_new := $new$
    'transient_minor_count', v_transient,
    'persistent_minor_count', v_minor_persistent,
    'prevented_by_health_protection_count', v_prevented_by_health_protection,
$new$;
  v_new := replace(v_new, v_return_old, v_return_new);

  execute v_new;
end;
$patch$;
