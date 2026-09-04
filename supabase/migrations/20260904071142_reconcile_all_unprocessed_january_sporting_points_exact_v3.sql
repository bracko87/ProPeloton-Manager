create or replace function public.race_stage_sporting_point_profile_readiness_v1(p_stage_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_stage public.race_stages%rowtype;
  v_profile public.race_stage_profile_details%rowtype;
  v_profile_found boolean := false;
  v_stage_sprints jsonb := '[]'::jsonb;
  v_stage_koms jsonb := '[]'::jsonb;
  v_profile_sprints jsonb := '[]'::jsonb;
  v_profile_koms jsonb := '[]'::jsonb;
  v_canonical_sprints jsonb := '[]'::jsonb;
  v_canonical_koms jsonb := '[]'::jsonb;
  v_start_count integer := 0;
  v_finish_count integer := 0;
  v_start_km numeric := null;
  v_finish_km numeric := null;
  v_expected_finish_km numeric := null;
  v_visible_sources_match boolean := false;
  v_catalogue_exact_match boolean := false;
  v_ready boolean := false;
  v_reason text;
begin
  if p_stage_id is null then
    return jsonb_build_object('ready',false,'reason','stage_id_required');
  end if;

  select * into v_stage from public.race_stages where id=p_stage_id;
  if not found then
    return jsonb_build_object('ready',false,'reason','stage_not_found','stage_id',p_stage_id);
  end if;

  select * into v_profile
  from public.race_stage_profile_details
  where stage_id=p_stage_id
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;
  v_profile_found := found;

  select coalesce(jsonb_agg(to_jsonb(km) order by km),'[]'::jsonb)
  into v_stage_sprints
  from (
    select nullif(item->>'km','')::numeric as km
    from jsonb_array_elements(case when jsonb_typeof(coalesce(v_stage.intermediate_sprints_json,'[]'::jsonb))='array' then coalesce(v_stage.intermediate_sprints_json,'[]'::jsonb) else '[]'::jsonb end) item
    where nullif(item->>'km','') is not null
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('km',km,'category',category) order by km,category),'[]'::jsonb)
  into v_stage_koms
  from (
    select nullif(item->>'km','')::numeric as km,
           upper(regexp_replace(coalesce(nullif(item->>'category',''),nullif(item->>'kom_category',''),'4'),'^CAT(EGORY)?[[:space:]]*','','i')) as category
    from jsonb_array_elements(case when jsonb_typeof(coalesce(v_stage.mountain_climbs_json,'[]'::jsonb))='array' then coalesce(v_stage.mountain_climbs_json,'[]'::jsonb) else '[]'::jsonb end) item
    where nullif(item->>'km','') is not null
  ) x;

  if v_profile_found then
    select coalesce(jsonb_agg(to_jsonb(km) order by km),'[]'::jsonb)
    into v_profile_sprints
    from (
      select nullif(item->>'km','')::numeric as km
      from jsonb_array_elements(case when jsonb_typeof(coalesce(v_profile.intermediate_sprints,'[]'::jsonb))='array' then coalesce(v_profile.intermediate_sprints,'[]'::jsonb) else '[]'::jsonb end) item
      where nullif(item->>'km','') is not null
    ) x;

    select coalesce(jsonb_agg(jsonb_build_object('km',km,'category',category) order by km,category),'[]'::jsonb)
    into v_profile_koms
    from (
      select nullif(item->>'km','')::numeric as km,
             upper(regexp_replace(coalesce(nullif(item->>'category',''),nullif(item->>'kom_category',''),'4'),'^CAT(EGORY)?[[:space:]]*','','i')) as category
      from jsonb_array_elements(case when jsonb_typeof(coalesce(v_profile.mountain_climbs,'[]'::jsonb))='array' then coalesce(v_profile.mountain_climbs,'[]'::jsonb) else '[]'::jsonb end) item
      where nullif(item->>'km','') is not null
    ) x;
    v_expected_finish_km := coalesce(v_profile.distance_km,v_stage.distance_km);
  else
    v_profile_sprints := v_stage_sprints;
    v_profile_koms := v_stage_koms;
    v_expected_finish_km := v_stage.distance_km;
  end if;

  select coalesce(jsonb_agg(to_jsonb(km) order by km),'[]'::jsonb)
  into v_canonical_sprints
  from (
    select km_from_start as km
    from public.race_stage_points
    where stage_id=p_stage_id and point_type in ('INTERMEDIATE_SPRINT','BONUS_SPRINT')
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('km',km,'category',category) order by km,category),'[]'::jsonb)
  into v_canonical_koms
  from (
    select km_from_start as km,
           upper(regexp_replace(coalesce(nullif(kom_category,''),'4'),'^CAT(EGORY)?[[:space:]]*','','i')) as category
    from public.race_stage_points
    where stage_id=p_stage_id and point_type='KOM'
  ) x;

  select count(*)::integer,min(km_from_start)
  into v_start_count,v_start_km
  from public.race_stage_points
  where stage_id=p_stage_id and point_type='START';

  select count(*)::integer,min(km_from_start)
  into v_finish_count,v_finish_km
  from public.race_stage_points
  where stage_id=p_stage_id and (point_type='FINISH' or is_finish_point);

  v_visible_sources_match :=
    (not v_profile_found)
    or (
      v_stage_sprints=v_profile_sprints
      and v_stage_koms=v_profile_koms
      and abs(coalesce(v_stage.distance_km,0)-coalesce(v_profile.distance_km,v_stage.distance_km,0))<=0.01
    );

  v_catalogue_exact_match :=
    v_start_count=1
    and abs(coalesce(v_start_km,999999))<=0.01
    and v_finish_count=1
    and abs(coalesce(v_finish_km,-999999)-coalesce(v_expected_finish_km,999999))<=0.01
    and v_canonical_sprints=v_profile_sprints
    and v_canonical_koms=v_profile_koms;

  v_ready := v_visible_sources_match and v_catalogue_exact_match;

  v_reason := case
    when not v_visible_sources_match and v_stage_sprints<>v_profile_sprints then 'stage_json_profile_sprint_position_mismatch'
    when not v_visible_sources_match and v_stage_koms<>v_profile_koms then 'stage_json_profile_kom_position_category_mismatch'
    when not v_visible_sources_match then 'stage_json_profile_distance_mismatch'
    when v_start_count<>1 then 'canonical_start_count_mismatch'
    when abs(coalesce(v_start_km,999999))>0.01 then 'canonical_start_position_mismatch'
    when v_finish_count<>1 then 'canonical_finish_count_mismatch'
    when abs(coalesce(v_finish_km,-999999)-coalesce(v_expected_finish_km,999999))>0.01 then 'canonical_finish_position_mismatch'
    when v_canonical_sprints<>v_profile_sprints then 'canonical_sprint_position_mismatch'
    when v_canonical_koms<>v_profile_koms then 'canonical_kom_position_category_mismatch'
    else 'ready'
  end;

  return jsonb_build_object(
    'ready',v_ready,'reason',v_reason,'stage_id',p_stage_id,'profile_found',v_profile_found,
    'stage_json_sprints',v_stage_sprints,'profile_sprints',v_profile_sprints,'canonical_sprints',v_canonical_sprints,
    'stage_json_koms',v_stage_koms,'profile_koms',v_profile_koms,'canonical_koms',v_canonical_koms,
    'canonical_start_count',v_start_count,'canonical_start_km',v_start_km,
    'canonical_finish_count',v_finish_count,'canonical_finish_km',v_finish_km,'expected_finish_km',v_expected_finish_km,
    'visible_sources_match',v_visible_sources_match,'catalogue_exact_match',v_catalogue_exact_match,
    'readiness_model','profile_catalogue_exact_positions_v2'
  );
end;
$function$;

create or replace function public.reconcile_unprocessed_stage_sporting_points_v1(p_stage_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_stage public.race_stages%rowtype;
  v_profile public.race_stage_profile_details%rowtype;
  v_profile_found boolean := false;
  v_readiness jsonb;
  v_stage_sprints jsonb;
  v_stage_koms jsonb;
  v_profile_sprints jsonb;
  v_profile_koms jsonb;
  v_stage_sprint_norm jsonb := '[]'::jsonb;
  v_stage_kom_norm jsonb := '[]'::jsonb;
  v_profile_sprint_norm jsonb := '[]'::jsonb;
  v_profile_kom_norm jsonb := '[]'::jsonb;
  v_profile_sprint_count integer := 0;
  v_profile_kom_count integer := 0;
  v_marker jsonb;
  v_scoring jsonb;
  v_points jsonb;
  v_bonus jsonb;
  v_default_sprint_points jsonb := '[12,8,5,3,1]'::jsonb;
  v_default_kom_points jsonb := '{}'::jsonb;
  v_idx integer;
  v_sort integer := 20;
  v_km numeric;
  v_category text;
  v_name text;
  v_finish_kom_category text := null;
begin
  if p_stage_id is null then return jsonb_build_object('status','blocked','reason','stage_id_required'); end if;
  perform pg_advisory_xact_lock(hashtextextended('stage_point_reconcile:'||p_stage_id::text,0));

  if exists (select 1 from public.race_stage_authoritative_runs where stage_id=p_stage_id) then
    return jsonb_build_object('status','not_modified','reason','authoritative_run_exists','stage_id',p_stage_id);
  end if;
  if exists (select 1 from public.race_stage_point_results where stage_id=p_stage_id) then
    return jsonb_build_object('status','not_modified','reason','official_point_results_exist','stage_id',p_stage_id);
  end if;

  select * into v_stage from public.race_stages where id=p_stage_id;
  if not found then return jsonb_build_object('status','blocked','reason','stage_not_found','stage_id',p_stage_id); end if;

  select * into v_profile
  from public.race_stage_profile_details
  where stage_id=p_stage_id
  order by updated_at desc nulls last,created_at desc nulls last
  limit 1;
  v_profile_found := found;

  v_stage_sprints := case when jsonb_typeof(coalesce(v_stage.intermediate_sprints_json,'[]'::jsonb))='array' then coalesce(v_stage.intermediate_sprints_json,'[]'::jsonb) else '[]'::jsonb end;
  v_stage_koms := case when jsonb_typeof(coalesce(v_stage.mountain_climbs_json,'[]'::jsonb))='array' then coalesce(v_stage.mountain_climbs_json,'[]'::jsonb) else '[]'::jsonb end;

  if v_profile_found then
    v_profile_sprints := case when jsonb_typeof(coalesce(v_profile.intermediate_sprints,'[]'::jsonb))='array' then coalesce(v_profile.intermediate_sprints,'[]'::jsonb) else '[]'::jsonb end;
    v_profile_koms := case when jsonb_typeof(coalesce(v_profile.mountain_climbs,'[]'::jsonb))='array' then coalesce(v_profile.mountain_climbs,'[]'::jsonb) else '[]'::jsonb end;
  else
    v_profile_sprints := v_stage_sprints;
    v_profile_koms := v_stage_koms;
  end if;

  select coalesce(jsonb_agg(to_jsonb(km) order by km),'[]'::jsonb) into v_stage_sprint_norm
  from (select nullif(item->>'km','')::numeric km from jsonb_array_elements(v_stage_sprints) item where nullif(item->>'km','') is not null) x;
  select coalesce(jsonb_agg(to_jsonb(km) order by km),'[]'::jsonb) into v_profile_sprint_norm
  from (select nullif(item->>'km','')::numeric km from jsonb_array_elements(v_profile_sprints) item where nullif(item->>'km','') is not null) x;

  select coalesce(jsonb_agg(jsonb_build_object('km',km,'category',category) order by km,category),'[]'::jsonb) into v_stage_kom_norm
  from (select nullif(item->>'km','')::numeric km,upper(regexp_replace(coalesce(nullif(item->>'category',''),nullif(item->>'kom_category',''),'4'),'^CAT(EGORY)?[[:space:]]*','','i')) category from jsonb_array_elements(v_stage_koms) item where nullif(item->>'km','') is not null) x;
  select coalesce(jsonb_agg(jsonb_build_object('km',km,'category',category) order by km,category),'[]'::jsonb) into v_profile_kom_norm
  from (select nullif(item->>'km','')::numeric km,upper(regexp_replace(coalesce(nullif(item->>'category',''),nullif(item->>'kom_category',''),'4'),'^CAT(EGORY)?[[:space:]]*','','i')) category from jsonb_array_elements(v_profile_koms) item where nullif(item->>'km','') is not null) x;

  if v_stage_sprint_norm<>v_profile_sprint_norm or v_stage_kom_norm<>v_profile_kom_norm or (v_profile_found and abs(coalesce(v_stage.distance_km,0)-coalesce(v_profile.distance_km,v_stage.distance_km,0))>0.01) then
    return jsonb_build_object('status','blocked','reason','stage_json_profile_exact_mismatch','stage_id',p_stage_id,
      'stage_json_sprints',v_stage_sprint_norm,'profile_sprints',v_profile_sprint_norm,'stage_json_koms',v_stage_kom_norm,'profile_koms',v_profile_kom_norm,
      'stage_distance_km',v_stage.distance_km,'profile_distance_km',case when v_profile_found then v_profile.distance_km else null end);
  end if;

  v_profile_sprint_count := jsonb_array_length(v_profile_sprints);
  v_profile_kom_count := jsonb_array_length(v_profile_koms);

  select payload->'points' into v_default_sprint_points from public.race_rules_config where code='intermediate_sprint_points_v1';
  v_default_sprint_points := coalesce(v_default_sprint_points,'[12,8,5,3,1]'::jsonb);
  select payload into v_default_kom_points from public.race_rules_config where code='kom_points_default_v1';
  v_default_kom_points := coalesce(v_default_kom_points,'{}'::jsonb);

  if coalesce(v_stage.is_summit_finish,false) then
    select nullif(regexp_replace(coalesce(item->>'category',item->>'kom_category',''),'^Cat[[:space:]]*','','i'),'')
    into v_finish_kom_category
    from jsonb_array_elements(v_stage_koms) item
    where coalesce(nullif(item->>'km','')::numeric,-1) between v_stage.distance_km::numeric-0.1 and v_stage.distance_km::numeric+0.1
    order by coalesce(nullif(item->>'km','')::numeric,0) desc limit 1;
    if v_finish_kom_category not in ('HC','1','2','3','4') then v_finish_kom_category:=null; end if;
  end if;

  delete from public.race_stage_points where stage_id=p_stage_id;
  perform public.seed_required_stage_points_v1(p_stage_id,v_finish_kom_category);

  for v_idx in 0..greatest(v_profile_sprint_count-1,-1) loop
    exit when v_profile_sprint_count=0;
    v_marker:=v_profile_sprints->v_idx;
    v_scoring:=v_stage_sprints->v_idx;
    v_km:=coalesce(nullif(v_marker->>'km','')::numeric,nullif(v_scoring->>'km','')::numeric);
    v_points:=case when jsonb_typeof(v_scoring->'points_scheme')='array' and jsonb_array_length(v_scoring->'points_scheme')>0 then v_scoring->'points_scheme'
      when jsonb_typeof(v_marker->'points_scheme')='array' and jsonb_array_length(v_marker->'points_scheme')>0 then v_marker->'points_scheme' else v_default_sprint_points end;
    v_bonus:=case when jsonb_typeof(v_scoring->'time_bonus_seconds')='array' then v_scoring->'time_bonus_seconds'
      when jsonb_typeof(v_marker->'time_bonus_seconds')='array' then v_marker->'time_bonus_seconds' else '[]'::jsonb end;
    if v_km is null then raise exception 'Cannot reconcile sprint marker % for stage %: km missing.',v_idx+1,p_stage_id; end if;
    v_name:=coalesce(nullif(v_marker->>'name',''),nullif(v_marker->>'label',''),nullif(v_scoring->>'name',''),'Sprint '||(v_idx+1)::text);
    insert into public.race_stage_points(stage_id,point_type,km_from_start,name,kom_category,points_scheme,time_bonus_seconds,is_finish_point,sort_order,metadata,updated_at)
    values(p_stage_id,'INTERMEDIATE_SPRINT',v_km,v_name,null,v_points,v_bonus,false,v_sort,jsonb_build_object('source','profile_stage_json_reconciliation_exact_v3','profile_marker_index',v_idx,'reconciled_at',clock_timestamp()),clock_timestamp());
    v_sort:=v_sort+10;
  end loop;

  for v_idx in 0..greatest(v_profile_kom_count-1,-1) loop
    exit when v_profile_kom_count=0;
    v_marker:=v_profile_koms->v_idx;
    v_scoring:=v_stage_koms->v_idx;
    v_km:=coalesce(nullif(v_marker->>'km','')::numeric,nullif(v_scoring->>'km','')::numeric);
    v_category:=upper(regexp_replace(coalesce(nullif(v_marker->>'category',''),nullif(v_marker->>'kom_category',''),nullif(v_scoring->>'category',''),nullif(v_scoring->>'kom_category',''),'4'),'^CAT(EGORY)?[[:space:]]*','','i'));
    if v_category not in ('HC','1','2','3','4') then v_category:='4'; end if;
    v_points:=case when jsonb_typeof(v_scoring->'points_scheme')='array' and jsonb_array_length(v_scoring->'points_scheme')>0 then v_scoring->'points_scheme'
      when jsonb_typeof(v_marker->'points_scheme')='array' and jsonb_array_length(v_marker->'points_scheme')>0 then v_marker->'points_scheme'
      when jsonb_typeof(v_default_kom_points->v_category)='array' then v_default_kom_points->v_category else '[]'::jsonb end;
    v_bonus:=case when jsonb_typeof(v_scoring->'time_bonus_seconds')='array' then v_scoring->'time_bonus_seconds'
      when jsonb_typeof(v_marker->'time_bonus_seconds')='array' then v_marker->'time_bonus_seconds' else '[]'::jsonb end;
    if v_km is null or jsonb_typeof(v_points)<>'array' or jsonb_array_length(v_points)=0 then raise exception 'Cannot reconcile KOM marker % for stage %: km/points scheme missing.',v_idx+1,p_stage_id; end if;
    v_name:=coalesce(nullif(v_marker->>'name',''),nullif(v_marker->>'label',''),nullif(v_scoring->>'name',''),'Cat '||v_category);
    insert into public.race_stage_points(stage_id,point_type,km_from_start,name,kom_category,points_scheme,time_bonus_seconds,is_finish_point,sort_order,metadata,updated_at)
    values(p_stage_id,'KOM',v_km,v_name,v_category,v_points,v_bonus,false,v_sort,jsonb_build_object('source','profile_stage_json_reconciliation_exact_v3','profile_marker_index',v_idx,'reconciled_at',clock_timestamp()),clock_timestamp());
    v_sort:=v_sort+10;
  end loop;

  update public.race_stage_points set sort_order=10,updated_at=clock_timestamp() where stage_id=p_stage_id and point_type='START';
  update public.race_stage_points set sort_order=v_sort+10,updated_at=clock_timestamp(),is_finish_point=true where stage_id=p_stage_id and point_type='FINISH';

  v_readiness:=public.race_stage_sporting_point_profile_readiness_v1(p_stage_id);
  return jsonb_build_object('status',case when coalesce((v_readiness->>'ready')::boolean,false) then 'reconciled' else 'blocked' end,
    'reason',coalesce(v_readiness->>'reason','unknown'),'stage_id',p_stage_id,'readiness',v_readiness);
exception when others then
  return jsonb_build_object('status','blocked','reason','reconciliation_error','stage_id',p_stage_id,'error',sqlerrm);
end;
$function$;

do $bulk$
declare
  r record;
  v_result jsonb;
begin
  for r in
    select s.id
    from public.race_stages s
    where extract(month from s.stage_date)=1
      and not exists(select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.id)
      and not exists(select 1 from public.race_stage_point_results pr where pr.stage_id=s.id)
      and not coalesce((public.race_stage_sporting_point_profile_readiness_v1(s.id)->>'ready')::boolean,false)
    order by s.stage_date,s.stage_number,s.id
  loop
    v_result:=public.reconcile_unprocessed_stage_sporting_points_v1(r.id);
    if coalesce(v_result->>'status','')<>'reconciled' then
      raise exception 'January sporting-point reconciliation failed for stage %: %',r.id,v_result::text;
    end if;
  end loop;
end;
$bulk$;