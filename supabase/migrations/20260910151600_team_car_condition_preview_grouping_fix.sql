-- get_race_plan_bonus_preview_v1 now scales Team Car effect rows by the
-- selected car's condition. Include condition_percent in grouped_assets so the
-- aggregate remains valid when the helper references that field.
do $migration$
declare
  v_def text;
  v_new text;
  v_group_old text := E'group by\r\n      ar.asset_key,\r\n      ar.asset_slot_key,\r\n      ar.display_name,\r\n      ar.asset_level';
  v_group_new text := E'group by\r\n      ar.asset_key,\r\n      ar.asset_slot_key,\r\n      ar.display_name,\r\n      ar.asset_level,\r\n      ar.condition_percent';
begin
  select pg_get_functiondef('public.get_race_plan_bonus_preview_v1(uuid,uuid[],jsonb)'::regprocedure)
  into v_def;

  if position('race_plan_asset_effective_value_v1' in v_def) = 0 then
    raise exception 'Team Car condition scaling helper is not present in preview function.';
  end if;

  if position('ar.asset_level,' || chr(13) || chr(10) || '      ar.condition_percent' in v_def) = 0
     and position(E'ar.asset_level,\n      ar.condition_percent' in v_def) = 0 then
    v_new := replace(v_def, v_group_old, v_group_new);

    if v_new = v_def then
      v_new := replace(
        v_def,
        E'group by\n      ar.asset_key,\n      ar.asset_slot_key,\n      ar.display_name,\n      ar.asset_level',
        E'group by\n      ar.asset_key,\n      ar.asset_slot_key,\n      ar.display_name,\n      ar.asset_level,\n      ar.condition_percent'
      );
    end if;

    if v_new = v_def then
      raise exception 'Expected grouped_assets GROUP BY block was not found.';
    end if;

    execute v_new;
  end if;
end;
$migration$;
