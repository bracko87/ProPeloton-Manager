do $block$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'race_engine_apply_rain_jacket_weather_exposure_v1'
  limit 1;

  if v_oid is null then
    raise exception 'race_engine_apply_rain_jacket_weather_exposure_v1 not found';
  end if;

  v_def := pg_get_functiondef(v_oid);
  if position('health_get_medical_center_risk_multiplier_v1(v_row.team_id)' in v_def) = 0 then
    v_new := replace(
      v_def,
      'if v_recent_exposure_count >= 2 and v_roll < 45 then',
      'if v_recent_exposure_count >= 2
       and v_roll < (45 * public.health_get_medical_center_risk_multiplier_v1(v_row.team_id)) then'
    );
    if v_new = v_def then
      raise exception 'Could not patch weather-exposure Medical Center prevention hook';
    end if;
    execute v_new;
  end if;
end;
$block$;
