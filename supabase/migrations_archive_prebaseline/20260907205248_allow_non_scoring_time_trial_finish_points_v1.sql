do $$
begin
  if to_regprocedure('public.universal_race_stage_validate_point_contract_legacy_v1(uuid,jsonb,jsonb)') is null then
    if to_regprocedure('public.universal_race_stage_validate_point_contract_v1(uuid,jsonb,jsonb)') is null then
      raise exception 'universal_race_stage_validate_point_contract_v1(uuid,jsonb,jsonb) is missing';
    end if;
    execute 'alter function public.universal_race_stage_validate_point_contract_v1(uuid,jsonb,jsonb) rename to universal_race_stage_validate_point_contract_legacy_v1';
  end if;
end
$$;

create or replace function public.universal_race_stage_validate_point_contract_v1(
  p_stage_id uuid,
  p_input_snapshot jsonb default null,
  p_universal_result jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
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
$function$;

revoke all on function public.universal_race_stage_validate_point_contract_legacy_v1(uuid,jsonb,jsonb) from public;
revoke all on function public.universal_race_stage_validate_point_contract_legacy_v1(uuid,jsonb,jsonb) from anon;
revoke all on function public.universal_race_stage_validate_point_contract_legacy_v1(uuid,jsonb,jsonb) from authenticated;
revoke all on function public.universal_race_stage_validate_point_contract_v1(uuid,jsonb,jsonb) from public;
revoke all on function public.universal_race_stage_validate_point_contract_v1(uuid,jsonb,jsonb) from anon;
revoke all on function public.universal_race_stage_validate_point_contract_v1(uuid,jsonb,jsonb) from authenticated;
grant execute on function public.universal_race_stage_validate_point_contract_v1(uuid,jsonb,jsonb) to service_role;