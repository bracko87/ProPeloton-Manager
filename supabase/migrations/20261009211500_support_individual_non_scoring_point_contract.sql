-- Individual-only road races (national qualification, national championship,
-- and similar rider-based events) intentionally rank the finish order without
-- awarding stage points. Their canonical contract therefore contains one START
-- and one FINISH row with empty points/bonus arrays.
--
-- Keep the legacy scoring contract unchanged for team races. Extend the existing
-- non-scoring time-trial exception only to races explicitly marked individual_only,
-- while retaining strict point type, distance, JSON-array and intermediate-point
-- validation.

create or replace function public.universal_race_stage_validate_point_contract_v1(
  p_stage_id uuid,
  p_input_snapshot jsonb default null::jsonb,
  p_universal_result jsonb default null::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_result jsonb;
  v_format text;
  v_individual_only boolean := false;
  v_race_category text;
  v_exception_structure_ok boolean := false;
  v_start_count integer := 0;
  v_finish_count integer := 0;
  v_other_invalid integer := 0;
  v_legacy_invalid integer := 0;
  v_validation_model text;
begin
  v_result := public.universal_race_stage_validate_point_contract_legacy_v1(
    p_stage_id,p_input_snapshot,p_universal_result
  );

  if coalesce(v_result->>'status','')='point_contract_ready' then
    return v_result;
  end if;

  select
    lower(coalesce(s.stage_format,'road_race')),
    lower(coalesce(r.metadata->>'individual_only','false')) in ('true','1','yes'),
    r.category
  into
    v_format,
    v_individual_only,
    v_race_category
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_stage_id;

  if v_format not in ('individual_time_trial','team_time_trial','prologue')
     and not v_individual_only
  then
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

  v_exception_structure_ok := coalesce(v_start_count,0)=1
    and coalesce(v_finish_count,0)=1
    and coalesce(v_other_invalid,0)=0;

  if not v_exception_structure_ok then
    return v_result;
  end if;

  if not coalesce((v_result#>>'{input,ready}')::boolean,true)
     or not coalesce((v_result#>>'{output,ready}')::boolean,true)
  then
    return v_result;
  end if;

  v_legacy_invalid := coalesce(
    nullif(v_result#>>'{canonical,invalid_row_count}','')::integer,
    0
  );
  v_validation_model := case
    when v_individual_only then 'phase11_individual_non_scoring_finish_exception_v1'
    else 'phase11_time_trial_finish_exception_v1'
  end;

  v_result := jsonb_set(v_result,'{status}','"point_contract_ready"'::jsonb,true);
  v_result := jsonb_set(v_result,'{canonical,ready}','true'::jsonb,true);
  v_result := jsonb_set(v_result,'{canonical,invalid_row_count}','0'::jsonb,true);
  v_result := jsonb_set(
    v_result,
    '{canonical,legacy_invalid_row_count}',
    to_jsonb(v_legacy_invalid),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{canonical,time_trial_non_scoring_finish_allowed}',
    to_jsonb(v_format in ('individual_time_trial','team_time_trial','prologue')),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{canonical,individual_non_scoring_finish_allowed}',
    to_jsonb(v_individual_only),
    true
  );
  v_result := jsonb_set(v_result,'{canonical,stage_format}',to_jsonb(v_format),true);
  v_result := jsonb_set(v_result,'{canonical,race_category}',to_jsonb(v_race_category),true);
  v_result := jsonb_set(v_result,'{validation_model}',to_jsonb(v_validation_model),true);

  return v_result;
end;
$function$;
