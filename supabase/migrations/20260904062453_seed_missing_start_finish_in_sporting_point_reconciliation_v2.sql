create or replace function public.reconcile_unprocessed_stage_sporting_points_v1(p_stage_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_stage public.race_stages%rowtype;
  v_profile public.race_stage_profile_details%rowtype;
  v_profile_found boolean := false;
  v_readiness jsonb;
  v_stage_sprints jsonb;
  v_stage_koms jsonb;
  v_profile_sprints jsonb;
  v_profile_koms jsonb;
  v_stage_sprint_count integer := 0;
  v_stage_kom_count integer := 0;
  v_profile_sprint_count integer := 0;
  v_profile_kom_count integer := 0;
  v_start_count integer := 0;
  v_finish_count integer := 0;
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
  if p_stage_id is null then
    return jsonb_build_object('status','blocked','reason','stage_id_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stage_point_reconcile:'||p_stage_id::text,0));

  if exists (select 1 from public.race_stage_authoritative_runs where stage_id=p_stage_id) then
    return jsonb_build_object('status','not_modified','reason','authoritative_run_exists','stage_id',p_stage_id);
  end if;
  if exists (select 1 from public.race_stage_point_results where stage_id=p_stage_id) then
    return jsonb_build_object('status','blocked','reason','official_point_results_exist','stage_id',p_stage_id);
  end if;

  select * into v_stage from public.race_stages where id=p_stage_id;
  if not found then
    return jsonb_build_object('status','blocked','reason','stage_not_found','stage_id',p_stage_id);
  end if;

  select * into v_profile
  from public.race_stage_profile_details
  where stage_id=p_stage_id
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;
  v_profile_found := found;

  v_stage_sprints := case when jsonb_typeof(coalesce(v_stage.intermediate_sprints_json,'[]'::jsonb))='array'
    then coalesce(v_stage.intermediate_sprints_json,'[]'::jsonb) else '[]'::jsonb end;
  v_stage_koms := case when jsonb_typeof(coalesce(v_stage.mountain_climbs_json,'[]'::jsonb))='array'
    then coalesce(v_stage.mountain_climbs_json,'[]'::jsonb) else '[]'::jsonb end;
  v_stage_sprint_count := jsonb_array_length(v_stage_sprints);
  v_stage_kom_count := jsonb_array_length(v_stage_koms);

  if v_profile_found then
    v_profile_sprints := case when jsonb_typeof(coalesce(v_profile.intermediate_sprints,'[]'::jsonb))='array'
      then coalesce(v_profile.intermediate_sprints,'[]'::jsonb) else '[]'::jsonb end;
    v_profile_koms := case when jsonb_typeof(coalesce(v_profile.mountain_climbs,'[]'::jsonb))='array'
      then coalesce(v_profile.mountain_climbs,'[]'::jsonb) else '[]'::jsonb end;
  else
    v_profile_sprints := v_stage_sprints;
    v_profile_koms := v_stage_koms;
  end if;

  v_profile_sprint_count := jsonb_array_length(v_profile_sprints);
  v_profile_kom_count := jsonb_array_length(v_profile_koms);

  if v_stage_sprint_count<>v_profile_sprint_count or v_stage_kom_count<>v_profile_kom_count then
    return jsonb_build_object(
      'status','blocked','reason','stage_json_profile_marker_count_mismatch','stage_id',p_stage_id,
      'stage_json_sprint_count',v_stage_sprint_count,'profile_sprint_count',v_profile_sprint_count,
      'stage_json_kom_count',v_stage_kom_count,'profile_kom_count',v_profile_kom_count
    );
  end if;

  select payload->'points' into v_default_sprint_points
  from public.race_rules_config where code='intermediate_sprint_points_v1';
  v_default_sprint_points := coalesce(v_default_sprint_points,'[12,8,5,3,1]'::jsonb);

  select payload into v_default_kom_points
  from public.race_rules_config where code='kom_points_default_v1';
  v_default_kom_points := coalesce(v_default_kom_points,'{}'::jsonb);

  if coalesce(v_stage.is_summit_finish,false) then
    select nullif(regexp_replace(coalesce(item->>'category',item->>'kom_category',''),'^Cat[[:space:]]*','','i'),'')
    into v_finish_kom_category
    from jsonb_array_elements(v_stage_koms) item
    where coalesce(nullif(item->>'km','')::numeric,-1) between v_stage.distance_km::numeric-0.1 and v_stage.distance_km::numeric+0.1
    order by coalesce(nullif(item->>'km','')::numeric,0) desc
    limit 1;
    if v_finish_kom_category not in ('HC','1','2','3','4') then v_finish_kom_category:=null; end if;
  end if;

  select count(*) filter(where point_type='START')::integer,
         count(*) filter(where point_type='FINISH' or is_finish_point)::integer
  into v_start_count,v_finish_count
  from public.race_stage_points where stage_id=p_stage_id;

  if v_start_count>1 or v_finish_count>1 then
    return jsonb_build_object('status','blocked','reason','canonical_start_finish_duplicate','stage_id',p_stage_id,
      'canonical_start_count',v_start_count,'canonical_finish_count',v_finish_count);
  end if;

  if v_start_count=0 or v_finish_count=0 then
    perform public.seed_required_stage_points_v1(p_stage_id,v_finish_kom_category);
  end if;

  select count(*) filter(where point_type='START')::integer,
         count(*) filter(where point_type='FINISH' or is_finish_point)::integer
  into v_start_count,v_finish_count
  from public.race_stage_points where stage_id=p_stage_id;

  if v_start_count<>1 then
    return jsonb_build_object('status','blocked','reason','canonical_start_count_mismatch','stage_id',p_stage_id,'canonical_start_count',v_start_count);
  end if;
  if v_finish_count<>1 then
    return jsonb_build_object('status','blocked','reason','canonical_finish_count_mismatch','stage_id',p_stage_id,'canonical_finish_count',v_finish_count);
  end if;

  delete from public.race_stage_points
  where stage_id=p_stage_id and point_type in ('INTERMEDIATE_SPRINT','BONUS_SPRINT','KOM');

  for v_idx in 0..greatest(v_profile_sprint_count-1,-1) loop
    exit when v_profile_sprint_count=0;
    v_marker := v_profile_sprints->v_idx;
    v_scoring := v_stage_sprints->v_idx;
    v_km := coalesce(nullif(v_marker->>'km','')::numeric,nullif(v_scoring->>'km','')::numeric);
    v_points := case when jsonb_typeof(v_scoring->'points_scheme')='array' and jsonb_array_length(v_scoring->'points_scheme')>0
      then v_scoring->'points_scheme'
      when jsonb_typeof(v_marker->'points_scheme')='array' and jsonb_array_length(v_marker->'points_scheme')>0
      then v_marker->'points_scheme'
      else v_default_sprint_points end;
    v_bonus := case when jsonb_typeof(v_scoring->'time_bonus_seconds')='array' then v_scoring->'time_bonus_seconds'
      when jsonb_typeof(v_marker->'time_bonus_seconds')='array' then v_marker->'time_bonus_seconds'
      else '[]'::jsonb end;
    if v_km is null then raise exception 'Cannot reconcile sprint marker % for stage %: km missing.',v_idx+1,p_stage_id; end if;
    v_name := coalesce(nullif(v_marker->>'name',''),nullif(v_marker->>'label',''),nullif(v_scoring->>'name',''),'Sprint '||(v_idx+1)::text);
    insert into public.race_stage_points(stage_id,point_type,km_from_start,name,kom_category,points_scheme,time_bonus_seconds,is_finish_point,sort_order,metadata,updated_at)
    values(p_stage_id,'INTERMEDIATE_SPRINT',v_km,v_name,null,v_points,v_bonus,false,v_sort,
      jsonb_build_object('source','profile_stage_json_reconciliation_v2','profile_marker_index',v_idx,'reconciled_at',clock_timestamp()),clock_timestamp());
    v_sort:=v_sort+10;
  end loop;

  for v_idx in 0..greatest(v_profile_kom_count-1,-1) loop
    exit when v_profile_kom_count=0;
    v_marker:=v_profile_koms->v_idx;
    v_scoring:=v_stage_koms->v_idx;
    v_km:=coalesce(nullif(v_marker->>'km','')::numeric,nullif(v_scoring->>'km','')::numeric);
    v_category:=upper(regexp_replace(coalesce(nullif(v_marker->>'category',''),nullif(v_marker->>'kom_category',''),nullif(v_scoring->>'category',''),nullif(v_scoring->>'kom_category',''),'4'),'^CAT(EGORY)?[[:space:]]*','','i'));
    if v_category not in ('HC','1','2','3','4') then v_category:='4'; end if;
    v_points:=case when jsonb_typeof(v_scoring->'points_scheme')='array' and jsonb_array_length(v_scoring->'points_scheme')>0
      then v_scoring->'points_scheme'
      when jsonb_typeof(v_marker->'points_scheme')='array' and jsonb_array_length(v_marker->'points_scheme')>0
      then v_marker->'points_scheme'
      when jsonb_typeof(v_default_kom_points->v_category)='array' then v_default_kom_points->v_category
      else '[]'::jsonb end;
    v_bonus:=case when jsonb_typeof(v_scoring->'time_bonus_seconds')='array' then v_scoring->'time_bonus_seconds'
      when jsonb_typeof(v_marker->'time_bonus_seconds')='array' then v_marker->'time_bonus_seconds'
      else '[]'::jsonb end;
    if v_km is null or jsonb_typeof(v_points)<>'array' or jsonb_array_length(v_points)=0 then
      raise exception 'Cannot reconcile KOM marker % for stage %: km/points scheme missing.',v_idx+1,p_stage_id;
    end if;
    v_name:=coalesce(nullif(v_marker->>'name',''),nullif(v_marker->>'label',''),nullif(v_scoring->>'name',''),'Cat '||v_category);
    insert into public.race_stage_points(stage_id,point_type,km_from_start,name,kom_category,points_scheme,time_bonus_seconds,is_finish_point,sort_order,metadata,updated_at)
    values(p_stage_id,'KOM',v_km,v_name,v_category,v_points,v_bonus,false,v_sort,
      jsonb_build_object('source','profile_stage_json_reconciliation_v2','profile_marker_index',v_idx,'reconciled_at',clock_timestamp()),clock_timestamp());
    v_sort:=v_sort+10;
  end loop;

  update public.race_stage_points set sort_order=10,updated_at=clock_timestamp()
  where stage_id=p_stage_id and point_type='START';
  update public.race_stage_points set sort_order=v_sort+10,updated_at=clock_timestamp(),is_finish_point=true
  where stage_id=p_stage_id and point_type='FINISH';

  v_readiness:=public.race_stage_sporting_point_profile_readiness_v1(p_stage_id);
  return jsonb_build_object('status',case when coalesce((v_readiness->>'ready')::boolean,false) then 'reconciled' else 'blocked' end,
    'reason',coalesce(v_readiness->>'reason','unknown'),'stage_id',p_stage_id,'readiness',v_readiness);
exception when others then
  return jsonb_build_object('status','blocked','reason','reconciliation_error','stage_id',p_stage_id,'error',sqlerrm);
end;
$$;

-- Proactively prepare only the imminent, still-unprocessed window. Later stages remain protected by the claim-time self-heal.
do $$
declare
  rec record;
  v_result jsonb;
begin
  for rec in
    select s.id
    from public.race_stages s
    where s.stage_date between date '2000-01-09' and date '2000-01-15'
      and not coalesce(s.weather_cancelled,false)
      and not exists(select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.id)
      and not exists(select 1 from public.race_stage_point_results pr where pr.stage_id=s.id)
    order by s.stage_date,s.planned_start_hour_number,s.planned_start_minute,s.id
  loop
    v_result:=public.reconcile_unprocessed_stage_sporting_points_v1(rec.id);
  end loop;
end;
$$;
