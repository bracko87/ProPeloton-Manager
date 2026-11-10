-- A weather-cancelled first stage has no official result or rider-fatigue output.
-- If ALL earlier stages were cancelled, the next stage is the first ridden stage.
-- Do not relax the missing-result guard for an earlier stage that was not cancelled.
-- Preserve original payload and existing function privileges/security settings.

DO $migration$
DECLARE
  v_definition text;
  v_old constant text := E'  if v_prev.stage_id is null then\n    raise exception ''late stage recovery: preceding official stage is missing for %'',p_stage_id;\n  end if;';
  v_new constant text := E'  if v_prev.stage_id is null then\n    -- Previous stages cancelled by weather have no official results.\n    -- A stage following only cancellations is the first actually raced stage.\n    if exists (\n      select 1 from public.race_stages prior_stage\n      where prior_stage.race_id=v_stage.race_id\n        and prior_stage.stage_number<v_stage.stage_number\n        and not coalesce(prior_stage.weather_cancelled,false)\n    ) then\n      raise exception ''late stage recovery: preceding official stage is missing for %'',p_stage_id;\n    end if;\n    return p_payload;\n  end if;';
  v_count integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='private'
    AND p.proname='recover_late_stage_fatigue_payload_v1';

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Late-stage fatigue recovery function is missing';
  END IF;

  -- A subsequent normal migration deployment must not reject a hotfix
  -- that is already present or silently overwrite a different implementation.
  IF strpos(v_definition,
    'Previous stages cancelled by weather have no official results.') > 0 THEN
    RAISE NOTICE 'Weather-cancelled preceding stage guard already installed';
  ELSE
    v_count := (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'Expected exactly one prior-stage guard, got %',v_count;
    END IF;
    EXECUTE replace(v_definition,v_old,v_new);
  END IF;
END;
$migration$;
