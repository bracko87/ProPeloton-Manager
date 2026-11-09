-- Connect tested, read-only late-stage recovery seed to production calculation payload.
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
  v_payload := private.filter_future_eliminated_stage_payload_v1(p_stage_id,v_payload);

  -- If a previous official stage was published only after the nightly tick,
  -- supply the stage-specific recovered seed without mutating riders or results.
  v_payload := private.recover_late_stage_fatigue_payload_v1(p_stage_id,v_payload);

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
$function$;
