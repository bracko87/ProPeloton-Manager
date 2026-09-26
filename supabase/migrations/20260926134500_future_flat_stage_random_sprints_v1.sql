-- Future flat-stage sprint layout policy v1.
-- Completed source-season sporting history is intentionally untouched.
-- Future copies of the Jan/Feb one-sprint flat-stage group receive 2-4
-- deterministic-random intermediate sprints, all snapped to engine-defined
-- flat segments and synchronized across calculation points, replay/profile
-- markers and stage JSON.
--
-- This also normalizes mixed-case profile terrain codes found during the
-- Season 1 -> Season 2 rollback verification.

CREATE OR REPLACE FUNCTION public.race_apply_future_flat_sprint_layout_v1(p_source_season integer, p_target_season integer, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source_year integer := 1999 + p_source_season;
  v_target_year integer := 1999 + p_target_season;
  rec record;
  sync_rec record;
  v_seed bytea;
  v_target_count integer;
  v_slot integer;
  v_distance numeric;
  v_desired_km numeric;
  v_pick_km numeric;
  v_spacing numeric;
  v_kms numeric[];
  v_sprints jsonb;
  v_markers jsonb;
  v_route_markers jsonb;
  v_assignments jsonb := '[]'::jsonb;
  v_randomized integer := 0;
  v_sync_repairs integer := 0;
begin
  if p_target_season is distinct from p_source_season + 1 then
    raise exception 'target season must equal source season + 1';
  end if;

  /*
   * Randomize only the historical one-sprint group identified from the
   * SOURCE relational point definitions. This intentionally does not mutate
   * completed source-season sporting history.
   */
  for rec in
    select
      sr.name as race_name,
      ss.id as source_stage_id,
      ss.stage_number,
      ss.distance_km::numeric as distance_km,
      ts.id as target_stage_id,
      ts.race_id as target_race_id,
      ts.terrain_type,
      ts.profile_type,
      ts.stage_format,
      coalesce(ts.metadata,'{}'::jsonb) as target_metadata,
      coalesce(td.route_markers,'[]'::jsonb) as route_markers
    from public.race_stages ss
    join public.races sr on sr.id=ss.race_id
    join public.race_stages ts
      on ts.id=public.season_calendar_deterministic_uuid_v1(
        'stage|'||ss.id::text||'|season|'||p_target_season::text
      )
    join public.races tr on tr.id=ts.race_id
    left join public.race_stage_profile_details td on td.stage_id=ts.id
    where extract(year from sr.start_date)::integer=v_source_year
      and sr.status<>'archived'
      and extract(month from ss.stage_date)::integer in (1,2)
      and lower(coalesce(ss.terrain_type,''))='flat'
      and lower(coalesce(ss.profile_type,'')) not like '%time_trial%'
      and lower(coalesce(ss.stage_format,'')) not in (
        'individual_time_trial','team_time_trial','time_trial','prologue'
      )
      and (
        select count(*)
        from public.race_stage_points sp
        where sp.stage_id=ss.id
          and upper(coalesce(sp.point_type,'')) in (
            'INTERMEDIATE_SPRINT','BONUS_SPRINT'
          )
      )=1
      and extract(year from tr.start_date)::integer=v_target_year
      and tr.metadata->>'calendar_source_season'=p_source_season::text
    order by sr.start_date,sr.name,ss.stage_number
  loop
    if exists (
      select 1 from public.race_stage_results x where x.stage_id=rec.target_stage_id
      union all
      select 1 from public.race_stage_point_results x where x.stage_id=rec.target_stage_id
      union all
      select 1 from public.race_stage_simulation_runs x where x.stage_id=rec.target_stage_id
    ) then
      raise exception
        'Refusing to alter sprint layout for target stage % because sporting output already exists',
        rec.target_stage_id;
    end if;

    v_distance := rec.distance_km;
    v_seed := decode(
      md5(rec.source_stage_id::text||'|season|'||p_target_season::text||'|flat-sprints-v1'),
      'hex'
    );
    v_target_count := 2 + (get_byte(v_seed,0) % 3);
    v_spacing := greatest(8::numeric, v_distance * 0.07);
    v_kms := array[]::numeric[];

    for v_slot in 1..v_target_count loop
      v_desired_km :=
        (
          (v_slot::numeric / (v_target_count + 1)::numeric)
          + (((get_byte(v_seed,least(15,v_slot))::numeric / 255) - 0.5) * 0.08)
        ) * v_distance;

      select round(((seg.km_start+seg.km_end)/2.0)::numeric,1)
      into v_pick_km
      from public.race_engine_get_stage_segments_v1(rec.target_stage_id) seg
      where seg.terrain_type='flat'
        and ((seg.km_start+seg.km_end)/2.0)
              between greatest(8::numeric,v_distance*0.08)
                  and least(v_distance-8::numeric,v_distance*0.92)
        and not exists (
          select 1
          from unnest(v_kms) already(km)
          where abs(((seg.km_start+seg.km_end)/2.0)-already.km) < v_spacing
        )
        and not exists (
          select 1
          from public.race_stage_points existing
          where existing.stage_id=rec.target_stage_id
            and upper(coalesce(existing.point_type,''))='KOM'
            and abs(existing.km_from_start::numeric-((seg.km_start+seg.km_end)/2.0)) < 2
        )
      order by
        abs(((seg.km_start+seg.km_end)/2.0)-v_desired_km),
        seg.segment_order
      limit 1;

      if v_pick_km is null then
        select round(((seg.km_start+seg.km_end)/2.0)::numeric,1)
        into v_pick_km
        from public.race_engine_get_stage_segments_v1(rec.target_stage_id) seg
        where seg.terrain_type='flat'
          and ((seg.km_start+seg.km_end)/2.0)
                between greatest(5::numeric,v_distance*0.05)
                    and least(v_distance-5::numeric,v_distance*0.95)
          and not (((seg.km_start+seg.km_end)/2.0)=any(v_kms))
        order by
          abs(((seg.km_start+seg.km_end)/2.0)-v_desired_km),
          seg.segment_order
        limit 1;
      end if;

      if v_pick_km is null then
        raise exception
          'No distinct flat segment available for sprint %/% on target stage %',
          v_slot,v_target_count,rec.target_stage_id;
      end if;

      v_kms := array_append(v_kms,v_pick_km);
    end loop;

    select array_agg(km order by km)
    into v_kms
    from unnest(v_kms) u(km);

    select jsonb_agg(
      jsonb_build_object(
        'km',u.km,
        'number',u.ordinal_number,
        'points','standard',
        'points_scheme','[12,8,5,3,1]'::jsonb,
        'time_bonus_seconds','[3,2,1]'::jsonb
      )
      order by u.km
    )
    into v_sprints
    from unnest(v_kms) with ordinality u(km,ordinal_number);

    select coalesce(
      jsonb_agg(marker order by marker_km, marker_order, marker_label),
      '[]'::jsonb
    )
    into v_markers
    from (
      select
        m.value as marker,
        coalesce(nullif(m.value->>'km','')::numeric,0) as marker_km,
        case lower(coalesce(m.value->>'type',''))
          when 'start' then 0
          when 'finish' then 30
          else 20
        end as marker_order,
        coalesce(m.value->>'label',m.value->>'name','') as marker_label
      from jsonb_array_elements(rec.route_markers) m(value)
      where lower(coalesce(m.value->>'type',m.value->>'point_type',''))
        not in ('sprint','intermediate_sprint','bonus_sprint')

      union all

      select
        jsonb_build_object(
          'km',u.km,
          'type','sprint',
          'label','Sprint '||u.ordinal_number::text
        ),
        u.km,
        10,
        'Sprint '||u.ordinal_number::text
      from unnest(v_kms) with ordinality u(km,ordinal_number)
    ) marker_rows;

    v_assignments := v_assignments || jsonb_build_array(
      jsonb_build_object(
        'race',rec.race_name,
        'stage',rec.stage_number,
        'source_stage_id',rec.source_stage_id,
        'target_stage_id',rec.target_stage_id,
        'sprint_count',v_target_count,
        'sprint_km',to_jsonb(v_kms)
      )
    );
    v_randomized := v_randomized + 1;

    if p_dry_run then
      continue;
    end if;

    update public.race_stages
    set intermediate_sprints_json=v_sprints,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'sprint_layout_policy_version','flat_random_2_4_v1',
          'sprint_layout_source_stage_id',rec.source_stage_id,
          'sprint_layout_source_season',p_source_season,
          'sprint_layout_target_season',p_target_season,
          'sprint_layout_count',v_target_count
        )
    where id=rec.target_stage_id;

    update public.race_stage_profile_details
    set intermediate_sprints=v_sprints,
        route_markers=v_markers,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'sprint_layout_policy_version','flat_random_2_4_v1'
        )
    where stage_id=rec.target_stage_id;

    if not found then
      raise exception 'Target profile row missing for stage %',rec.target_stage_id;
    end if;

    delete from public.race_stage_points
    where stage_id=rec.target_stage_id
      and upper(coalesce(point_type,'')) in (
        'INTERMEDIATE_SPRINT','BONUS_SPRINT'
      );

    insert into public.race_stage_points(
      stage_id,
      point_type,
      km_from_start,
      name,
      kom_category,
      points_scheme,
      time_bonus_seconds,
      is_finish_point,
      sort_order,
      metadata
    )
    select
      rec.target_stage_id,
      'INTERMEDIATE_SPRINT',
      u.km,
      'Intermediate sprint '||u.ordinal_number::text,
      null,
      '[12,8,5,3,1]'::jsonb,
      '[3,2,1]'::jsonb,
      false,
      (u.ordinal_number::integer)*10,
      jsonb_build_object(
        'source','flat_random_2_4_v1',
        'source_stage_id',rec.source_stage_id,
        'target_season',p_target_season
      )
    from unnest(v_kms) with ordinality u(km,ordinal_number);

    with ranked as (
      select
        id,
        ((row_number() over(
          order by km_from_start,
                   case upper(coalesce(point_type,''))
                     when 'START' then 0
                     when 'INTERMEDIATE_SPRINT' then 10
                     when 'BONUS_SPRINT' then 10
                     when 'KOM' then 20
                     when 'FINISH' then 30
                     else 25
                   end,
                   id
        )-1)*10)::integer as new_sort_order
      from public.race_stage_points
      where stage_id=rec.target_stage_id
    )
    update public.race_stage_points p
    set sort_order=r.new_sort_order
    from ranked r
    where p.id=r.id
      and p.sort_order is distinct from r.new_sort_order;
  end loop;

  /*
   * Repair copied future definitions when the source relational sprint rows
   * already contain the correct multi-sprint logic but stage/profile JSON do
   * not. This preserves sporting logic and only synchronizes the future copy.
   */
  for sync_rec in
    select
      sr.name as race_name,
      ss.id as source_stage_id,
      ss.stage_number,
      ts.id as target_stage_id,
      coalesce(td.route_markers,'[]'::jsonb) as route_markers
    from public.race_stages ss
    join public.races sr on sr.id=ss.race_id
    join public.race_stages ts
      on ts.id=public.season_calendar_deterministic_uuid_v1(
        'stage|'||ss.id::text||'|season|'||p_target_season::text
      )
    join public.races tr on tr.id=ts.race_id
    left join public.race_stage_profile_details td on td.stage_id=ts.id
    where extract(year from sr.start_date)::integer=v_source_year
      and sr.status<>'archived'
      and extract(month from ss.stage_date)::integer in (1,2)
      and lower(coalesce(ss.terrain_type,''))='flat'
      and lower(coalesce(ss.profile_type,'')) not like '%time_trial%'
      and lower(coalesce(ss.stage_format,'')) not in (
        'individual_time_trial','team_time_trial','time_trial','prologue'
      )
      and (
        select count(*)
        from public.race_stage_points sp
        where sp.stage_id=ss.id
          and upper(coalesce(sp.point_type,'')) in (
            'INTERMEDIATE_SPRINT','BONUS_SPRINT'
          )
      ) >= 2
      and (
        select count(*)
        from public.race_stage_points sp
        where sp.stage_id=ss.id
          and upper(coalesce(sp.point_type,'')) in (
            'INTERMEDIATE_SPRINT','BONUS_SPRINT'
          )
      ) <> jsonb_array_length(coalesce(ss.intermediate_sprints_json,'[]'::jsonb))
      and extract(year from tr.start_date)::integer=v_target_year
      and tr.metadata->>'calendar_source_season'=p_source_season::text
      and coalesce(ts.metadata->>'sprint_sync_repair_version','')
          <> 'source_points_v1'
  loop
    select jsonb_agg(
      jsonb_build_object(
        'km',p.km_from_start::numeric,
        'number',row_number_value,
        'name',p.name,
        'point_type',upper(p.point_type),
        'points','standard',
        'points_scheme',coalesce(p.points_scheme,'[]'::jsonb),
        'time_bonus_seconds',coalesce(p.time_bonus_seconds,'[]'::jsonb)
      )
      order by p.km_from_start
    )
    into v_sprints
    from (
      select
        p.*,
        row_number() over(order by p.km_from_start,p.id) as row_number_value
      from public.race_stage_points p
      where p.stage_id=sync_rec.source_stage_id
        and upper(coalesce(p.point_type,'')) in (
          'INTERMEDIATE_SPRINT','BONUS_SPRINT'
        )
    ) p;

    select coalesce(
      jsonb_agg(marker order by marker_km, marker_order, marker_label),
      '[]'::jsonb
    )
    into v_markers
    from (
      select
        m.value as marker,
        coalesce(nullif(m.value->>'km','')::numeric,0) as marker_km,
        case lower(coalesce(m.value->>'type',''))
          when 'start' then 0
          when 'finish' then 30
          else 20
        end as marker_order,
        coalesce(m.value->>'label',m.value->>'name','') as marker_label
      from jsonb_array_elements(sync_rec.route_markers) m(value)
      where lower(coalesce(m.value->>'type',m.value->>'point_type',''))
        not in ('sprint','intermediate_sprint','bonus_sprint')

      union all

      select
        jsonb_build_object(
          'km',(s.item->>'km')::numeric,
          'type','sprint',
          'label','Sprint '||s.ordinal_number::text
        ),
        (s.item->>'km')::numeric,
        10,
        'Sprint '||s.ordinal_number::text
      from jsonb_array_elements(v_sprints) with ordinality s(item,ordinal_number)
    ) marker_rows;

    v_sync_repairs := v_sync_repairs + 1;

    if p_dry_run then
      continue;
    end if;

    update public.race_stages
    set intermediate_sprints_json=v_sprints,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'sprint_sync_repair_version','source_points_v1',
          'sprint_sync_source_stage_id',sync_rec.source_stage_id
        )
    where id=sync_rec.target_stage_id;

    update public.race_stage_profile_details
    set intermediate_sprints=v_sprints,
        route_markers=v_markers,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'sprint_sync_repair_version','source_points_v1'
        )
    where stage_id=sync_rec.target_stage_id;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'policy_version','flat_random_2_4_v1',
    'source_season',p_source_season,
    'target_season',p_target_season,
    'dry_run',p_dry_run,
    'randomized_stages',v_randomized,
    'future_sync_repairs',v_sync_repairs,
    'assignments',v_assignments
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_season_calendar_stage_point_reconciliation_v3(p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_source_year integer := 1999+p_source_season;
  v_target_year integer := 1999+p_target_season;
  v_unexplained integer := 0;
  v_invalid_policy integer := 0;
  v_policy_stages integer := 0;
  v_orphans integer := 0;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'target season must equal source season + 1';
  end if;

  v_base := public.validate_season_calendar_stage_point_reconciliation_v2(
    p_source_season,p_target_season
  );

  if coalesce((v_base->>'ok')::boolean,false) then
    return v_base || jsonb_build_object(
      'validator_version','v3',
      'sprint_policy_stages',0,
      'sprint_policy_invalid',0,
      'unexplained_point_divergence_stages',0
    );
  end if;

  v_orphans := coalesce((v_base->>'orphan_target_points')::integer,0);

  with paired as (
    select
      ss.id source_stage_id,
      ts.id target_stage_id,
      coalesce(ts.metadata->>'sprint_layout_policy_version','') policy_version,
      (select count(*) from public.race_stage_points sp where sp.stage_id=ss.id) source_count,
      (select count(*) from public.race_stage_points tp where tp.stage_id=ts.id) target_count
    from public.race_stages ss
    join public.races sr on sr.id=ss.race_id
    join public.race_stages ts
      on ts.id=public.season_calendar_deterministic_uuid_v1(
        'stage|'||ss.id::text||'|season|'||p_target_season::text
      )
    join public.races tr on tr.id=ts.race_id
    where extract(year from sr.start_date)::integer=v_source_year
      and sr.status<>'archived'
      and extract(year from tr.start_date)::integer=v_target_year
      and tr.metadata->>'calendar_source_season'=p_source_season::text
  )
  select count(*)::integer
  into v_unexplained
  from paired
  where source_count<>target_count
    and policy_version<>'flat_random_2_4_v1';

  select count(*)::integer
  into v_policy_stages
  from public.race_stages ts
  join public.races tr on tr.id=ts.race_id
  where extract(year from tr.start_date)::integer=v_target_year
    and tr.metadata->>'calendar_source_season'=p_source_season::text
    and ts.metadata->>'sprint_layout_policy_version'='flat_random_2_4_v1';

  select count(*)::integer
  into v_invalid_policy
  from public.race_stages ts
  join public.races tr on tr.id=ts.race_id
  left join public.race_stage_profile_details d on d.stage_id=ts.id
  where extract(year from tr.start_date)::integer=v_target_year
    and tr.metadata->>'calendar_source_season'=p_source_season::text
    and ts.metadata->>'sprint_layout_policy_version'='flat_random_2_4_v1'
    and (
      jsonb_array_length(coalesce(ts.intermediate_sprints_json,'[]'::jsonb)) not between 2 and 4
      or jsonb_array_length(coalesce(d.intermediate_sprints,'[]'::jsonb))
           <> jsonb_array_length(coalesce(ts.intermediate_sprints_json,'[]'::jsonb))
      or (
        select count(*)
        from public.race_stage_points p
        where p.stage_id=ts.id
          and upper(coalesce(p.point_type,'')) in ('INTERMEDIATE_SPRINT','BONUS_SPRINT')
      ) <> jsonb_array_length(coalesce(ts.intermediate_sprints_json,'[]'::jsonb))
      or (
        select count(*)
        from jsonb_array_elements(coalesce(d.route_markers,'[]'::jsonb)) m
        where lower(coalesce(m->>'type',m->>'point_type',''))
              in ('sprint','intermediate_sprint','bonus_sprint')
      ) <> jsonb_array_length(coalesce(ts.intermediate_sprints_json,'[]'::jsonb))
      or exists (
        (
          select round((j->>'km')::numeric,1)
          from jsonb_array_elements(coalesce(ts.intermediate_sprints_json,'[]'::jsonb)) j
          except
          select round(p.km_from_start::numeric,1)
          from public.race_stage_points p
          where p.stage_id=ts.id
            and upper(coalesce(p.point_type,'')) in ('INTERMEDIATE_SPRINT','BONUS_SPRINT')
        )
        union all
        (
          select round(p.km_from_start::numeric,1)
          from public.race_stage_points p
          where p.stage_id=ts.id
            and upper(coalesce(p.point_type,'')) in ('INTERMEDIATE_SPRINT','BONUS_SPRINT')
          except
          select round((j->>'km')::numeric,1)
          from jsonb_array_elements(coalesce(ts.intermediate_sprints_json,'[]'::jsonb)) j
        )
      )
      or exists (
        select 1
        from public.race_stage_points p
        where p.stage_id=ts.id
          and upper(coalesce(p.point_type,'')) in ('INTERMEDIATE_SPRINT','BONUS_SPRINT')
          and not exists (
            select 1
            from public.race_engine_get_stage_segments_v1(ts.id) seg
            where seg.terrain_type='flat'
              and p.km_from_start::numeric between seg.km_start and seg.km_end
          )
      )
      or exists(select 1 from public.race_stage_results x where x.stage_id=ts.id)
      or exists(select 1 from public.race_stage_point_results x where x.stage_id=ts.id)
      or exists(select 1 from public.race_stage_simulation_runs x where x.stage_id=ts.id)
    );

  if v_orphans=0 and v_unexplained=0 and v_invalid_policy=0 and v_policy_stages>0 then
    return v_base || jsonb_build_object(
      'ok',true,
      'validator_version','v3',
      'base_validator_ok',false,
      'sprint_policy_stages',v_policy_stages,
      'sprint_policy_invalid',v_invalid_policy,
      'unexplained_point_divergence_stages',v_unexplained,
      'policy','Target point-count divergence is allowed only for synchronized flat_random_2_4_v1 future stages whose sprint JSON, profile markers, relational points, flat-segment placement, and no-sporting-output invariants all validate.'
    );
  end if;

  return v_base || jsonb_build_object(
    'ok',false,
    'validator_version','v3',
    'base_validator_ok',coalesce((v_base->>'ok')::boolean,false),
    'sprint_policy_stages',v_policy_stages,
    'sprint_policy_invalid',v_invalid_policy,
    'unexplained_point_divergence_stages',v_unexplained
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_next_season_race_calendar_v1(p_source_season integer, p_target_season integer, p_late_recovery boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_sprint_layout jsonb;
  r record;
  v_recalculated integer := 0;
begin
  v_result := public.prepare_next_season_race_calendar_v1_legacy_before_application_deadline_policy(
    p_source_season,p_target_season,p_late_recovery
  );

  if coalesce((v_result->>'ok')::boolean,false) then
    v_sprint_layout := public.race_apply_future_flat_sprint_layout_v1(
      p_source_season,p_target_season,false
    );

    for r in
      select rer.race_id
      from public.race_entry_rules rer
      where rer.race_season_number=p_target_season
    loop
      perform * from public.recalculate_race_entry_deadlines_v1(r.race_id);
      v_recalculated := v_recalculated + 1;
    end loop;
  else
    v_sprint_layout := jsonb_build_object(
      'ok',false,
      'skipped',true,
      'reason','calendar_prepare_failed'
    );
  end if;

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'application_deadlines_recalculated',v_recalculated,
    'application_deadline_policy_version','jan_late_d3_feb_onward_d7_v1',
    'flat_sprint_layout',v_sprint_layout
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.run_race_calendar_season_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source_year integer:=1999+p_source_season;
  v_target_year integer:=1999+p_target_season;
  v_expected_races integer;
  v_expected_stages integer;
  v_expected_profiles integer;
  v_expected_points integer;
  v_expected_tt integer;
  v_target_races integer;
  v_target_stages integer;
  v_target_profiles integer;
  v_target_points integer;
  v_target_tt integer;
  v_preseason_rows bigint;
  v_forbidden_rows bigint;
  v_bad_status integer;
  v_bad_dates integer;
  v_missing_rules integer;
  v_point_reconciliation jsonb;
  v_points_ok boolean;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'target season must equal source season + 1';
  end if;
  if not exists(
    select 1 from public.season_transition_runs_v1 r
    where r.id=p_transition_run_id
      and r.status='running'
      and r.source_season=p_source_season
      and r.target_season=p_target_season
  ) then
    raise exception 'matching running season transition not found';
  end if;

  select count(*) into v_expected_races from public.races r where extract(year from r.start_date)::int=v_source_year and r.status<>'archived';
  select count(*) into v_expected_stages from public.race_stages s join public.races r on r.id=s.race_id where extract(year from r.start_date)::int=v_source_year and r.status<>'archived';
  select count(*) into v_expected_profiles from public.race_stage_profile_details d join public.races r on r.id=d.race_id where extract(year from r.start_date)::int=v_source_year and r.status<>'archived';
  select count(*) into v_expected_points from public.race_stage_points p join public.race_stages s on s.id=p.stage_id join public.races r on r.id=s.race_id where extract(year from r.start_date)::int=v_source_year and r.status<>'archived';
  select count(*) into v_expected_tt from public.race_stage_time_trial_rules t join public.race_stages s on s.id=t.stage_id join public.races r on r.id=s.race_id where extract(year from r.start_date)::int=v_source_year and r.status<>'archived';

  select count(*) into v_target_races from public.races r where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
  select count(*) into v_target_stages from public.race_stages s join public.races r on r.id=s.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
  select count(*) into v_target_profiles from public.race_stage_profile_details d join public.races r on r.id=d.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
  select count(*) into v_target_points from public.race_stage_points p join public.race_stages s on s.id=p.stage_id join public.races r on r.id=s.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
  select count(*) into v_target_tt from public.race_stage_time_trial_rules t join public.race_stages s on s.id=t.stage_id join public.races r on r.id=s.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;

  v_point_reconciliation := public.validate_season_calendar_stage_point_reconciliation_v3(p_source_season,p_target_season);
  v_points_ok := coalesce((v_point_reconciliation->>'ok')::boolean,false);

  select count(*) into v_missing_rules from public.races r left join public.race_entry_rules e on e.race_id=r.id
  where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text and (e.race_id is null or e.race_season_number<>p_target_season);
  select count(*) into v_bad_status from public.races r
  where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text and r.status not in ('scheduled','active');
  select count(*) into v_bad_dates from public.race_stages s join public.races r on r.id=s.race_id
  where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text and (s.stage_date<r.start_date or s.stage_date>r.end_date);

  select
    (select count(*) from public.race_team_applications a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
   +(select count(*) from public.race_team_entries a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
   +(select count(*) from public.race_participant_teams a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
   +(select count(*) from public.race_participant_riders a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
   +(select count(*) from public.race_preparations a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
  into v_preseason_rows;

  select
    (select count(*) from public.race_stage_results a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
   +(select count(*) from public.race_classification_standings a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
   +(select count(*) from public.race_prize_awards a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
   +(select count(*) from public.race_ranking_point_awards a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
   +(select count(*) from public.race_stage_simulation_runs a join public.races r on r.id=a.race_id where extract(year from r.start_date)::int=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text)
  into v_forbidden_rows;

  if v_target_races<>v_expected_races
     or v_target_stages<>v_expected_stages
     or v_target_profiles<>v_expected_profiles
     or not v_points_ok
     or v_target_tt<>v_expected_tt
     or v_missing_rules<>0
     or v_bad_status<>0
     or v_bad_dates<>0
     or v_forbidden_rows<>0 then
    raise exception 'Target race calendar invariant failed: races %/%, stages %/%, profiles %/%, points %/% reconciliation_ok %, tt %/%, missing_rules %, bad_status %, bad_dates %, forbidden_history_rows %, preseason_operational_rows %, point_reconciliation %',
      v_target_races,v_expected_races,
      v_target_stages,v_expected_stages,
      v_target_profiles,v_expected_profiles,
      v_target_points,v_expected_points,v_points_ok,
      v_target_tt,v_expected_tt,
      v_missing_rules,v_bad_status,v_bad_dates,v_forbidden_rows,v_preseason_rows,
      v_point_reconciliation::text;
  end if;

  return jsonb_build_object(
    'ok',true,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'races',v_target_races,
    'stages',v_target_stages,
    'profiles',v_target_profiles,
    'stage_points',v_target_points,
    'source_stage_points',v_expected_points,
    'point_reconciliation',v_point_reconciliation,
    'tt_rules',v_target_tt,
    'preseason_operational_rows',v_preseason_rows,
    'forbidden_history_rows',v_forbidden_rows,
    'missing_entry_rules',v_missing_rules,
    'bad_stage_dates',v_bad_dates
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.dry_run_race_calendar_season_transition_v1(p_source_season integer DEFAULT 1, p_target_season integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source_year integer:=1999+p_source_season;
  v_target_year integer:=1999+p_target_season;
  v_before integer;
  v_after_rollback integer;
  v_first jsonb;
  v_second jsonb;
  v_verify jsonb;
  v_timeline uuid;
  v_run uuid;
  v_target_races integer;
  v_target_stages integer;
  v_target_rules integer;
  v_target_profiles integer;
  v_target_points integer;
  v_target_tt integer;
  v_recovery integer;
  v_open integer;
  v_archived_cloned integer;
  v_cancelled_source_scheduled integer;
  v_feb29_shift_ok boolean:=false;
  v_dynamic bigint;
  v_second_zero boolean:=false;
  v_ok boolean:=false;
begin
  if p_target_season is distinct from p_source_season+1 then raise exception 'target must equal source + 1'; end if;
  select count(*) into v_before from public.races where extract(year from start_date)::integer=v_target_year;

  begin
    v_first:=public.prepare_next_season_race_calendar_v1(p_source_season,p_target_season,true);

    select count(*) into v_target_races from public.races r where extract(year from r.start_date)::integer=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
    select count(*) into v_target_stages from public.race_stages s join public.races r on r.id=s.race_id where extract(year from r.start_date)::integer=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
    select count(*) into v_target_rules from public.race_entry_rules e join public.races r on r.id=e.race_id where extract(year from r.start_date)::integer=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
    select count(*) into v_target_profiles from public.race_stage_profile_details d join public.races r on r.id=d.race_id where extract(year from r.start_date)::integer=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
    select count(*) into v_target_points from public.race_stage_points p join public.race_stages s on s.id=p.stage_id join public.races r on r.id=s.race_id where extract(year from r.start_date)::integer=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;
    select count(*) into v_target_tt from public.race_stage_time_trial_rules t join public.race_stages s on s.id=t.stage_id join public.races r on r.id=s.race_id where extract(year from r.start_date)::integer=v_target_year and r.metadata->>'calendar_source_season'=p_source_season::text;

    select count(*) into v_recovery from public.race_entry_rules e join public.races r on r.id=e.race_id
      where e.race_season_number=p_target_season and r.metadata->>'calendar_source_season'=p_source_season::text and e.application_deadline_policy='late_calendar_recovery_v1';
    select count(*) into v_open from public.race_entry_rules e join public.races r on r.id=e.race_id
      where e.race_season_number=p_target_season and r.metadata->>'calendar_source_season'=p_source_season::text and e.applications_status='open';

    select count(*) into v_archived_cloned
    from public.races src
    where extract(year from src.start_date)::integer=v_source_year and src.status='archived'
      and exists(select 1 from public.races trg where trg.id=public.season_calendar_deterministic_uuid_v1('race|'||src.id::text||'|season|'||p_target_season::text));

    select count(*) into v_cancelled_source_scheduled
    from public.races src
    join public.races trg on trg.id=public.season_calendar_deterministic_uuid_v1('race|'||src.id::text||'|season|'||p_target_season::text)
    where extract(year from src.start_date)::integer=v_source_year and src.status='cancelled' and trg.status='scheduled';

    select exists(
      select 1 from public.races src
      join public.races trg on trg.id=public.season_calendar_deterministic_uuid_v1('race|'||src.id::text||'|season|'||p_target_season::text)
      where src.start_date=make_date(v_source_year,2,29) and trg.start_date=make_date(v_target_year,2,28)
    ) into v_feb29_shift_ok;

    select timeline_id into v_timeline from public.season_transition_control_v1 where id=true;
    insert into public.season_transition_runs_v1(timeline_id,source_season,target_season,status,metadata)
    values(v_timeline,p_source_season,p_target_season,'running',jsonb_build_object('dry_run','race_calendar_v1')) returning id into v_run;
    v_verify:=public.run_race_calendar_season_transition_v1(v_run,p_source_season,p_target_season);
    v_dynamic:=coalesce((v_verify->>'dynamic_rows_copied')::bigint,-1);

    v_second:=public.prepare_next_season_race_calendar_v1(p_source_season,p_target_season,true);
    v_second_zero:=
      coalesce((v_second->'inserted'->>'races')::integer,-1)=0 and
      coalesce((v_second->'inserted'->>'stages')::integer,-1)=0 and
      coalesce((v_second->'inserted'->>'entry_rules')::integer,-1)=0 and
      coalesce((v_second->'inserted'->>'profiles')::integer,-1)=0 and
      coalesce((v_second->'inserted'->>'points')::integer,-1)=0 and
      coalesce((v_second->'inserted'->>'tt_rule_writes')::integer,-1)=0 and
      coalesce((v_second->>'late_recovery_rules')::integer,-1)=0;

    v_ok:=v_target_races=591 and v_target_stages=1626 and v_target_rules=591 and v_target_profiles=1626 and v_target_tt=74 and coalesce((v_verify->'point_reconciliation'->>'ok')::boolean,false)
      and v_recovery>0 and v_open>0 and v_archived_cloned=0 and v_cancelled_source_scheduled=1 and v_feb29_shift_ok and v_dynamic=0 and v_second_zero
      and coalesce((v_verify->>'missing_entry_rules')::integer,-1)=0 and coalesce((v_verify->>'bad_stage_dates')::integer,-1)=0;

    raise exception '__ROLLBACK_RACE_CALENDAR_DRY_RUN__';
  exception when others then
    if sqlerrm<>'__ROLLBACK_RACE_CALENDAR_DRY_RUN__' then raise; end if;
  end;

  select count(*) into v_after_rollback from public.races where extract(year from start_date)::integer=v_target_year;
  v_ok:=v_ok and v_after_rollback=v_before and not exists(select 1 from public.season_transition_runs_v1 where metadata->>'dry_run'='race_calendar_v1');

  return jsonb_build_object('ok',v_ok,'first_pass',v_first,'verification',v_verify,'second_pass',v_second,
    'target_counts_inside_test',jsonb_build_object('races',v_target_races,'stages',v_target_stages,'entry_rules',v_target_rules,'profiles',v_target_profiles,'points',v_target_points,'tt_rules',v_target_tt),
    'late_recovery',jsonb_build_object('rules',v_recovery,'currently_open',v_open),
    'archived_races_cloned',v_archived_cloned,'cancelled_source_returned_scheduled',v_cancelled_source_scheduled,'feb29_to_feb28',v_feb29_shift_ok,
    'dynamic_rows_copied',v_dynamic,'second_pass_zero_work',v_second_zero,'production_target_races_before',v_before,'production_target_races_after_rollback',v_after_rollback);
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_race_stage_profile_metadata_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_summit_finish boolean := false;
  v_split jsonb;
  v_terrain_type text;
begin
  v_terrain_type := case
    when new.terrain_type is null then null
    else lower(trim(new.terrain_type))
  end;

  v_split := public.normalize_race_stage_terrain_split_v1(
    new.terrain_split,
    v_terrain_type
  );

  v_summit_finish :=
    coalesce(v_terrain_type, '') = 'mountain'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(new.mountain_climbs, '[]'::jsonb)) climb
      where abs(
        coalesce(nullif(climb->>'km','')::numeric, -999999)
        - coalesce(new.distance_km, 0)
      ) <= 0.25
      and upper(
        regexp_replace(
          coalesce(climb->>'category', climb->>'kom_category', ''),
          '^CAT(EGORY)?[[:space:]]*',
          '',
          'i'
        )
      ) in ('HC','1','2')
    );

  update public.race_stages stage
  set
    terrain_type = coalesce(v_terrain_type, stage.terrain_type),
    profile_type = coalesce(new.profile_type, stage.profile_type),
    flat_pct = (v_split->>'flat')::numeric,
    hilly_pct = (v_split->>'hilly')::numeric,
    mountain_pct = (v_split->>'mountain')::numeric,
    cobbled_pct = (v_split->>'cobbled')::numeric,
    elevation_gain_m = coalesce(new.elevation_gain_m, stage.elevation_gain_m),
    finish_type = case when v_summit_finish then 'summit_finish' else stage.finish_type end,
    is_summit_finish = case when v_summit_finish then true else stage.is_summit_finish end,
    updated_at = clock_timestamp()
  where stage.id = new.stage_id
    and not exists (
      select 1
      from public.race_stage_authoritative_runs authority
      where authority.stage_id = stage.id
    );

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dry_run_future_flat_sprint_layout_v1(p_source_season integer DEFAULT 1, p_target_season integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_before integer;
  v_after integer;
  v_first jsonb;
  v_second jsonb;
  v_validate_first jsonb;
  v_validate_second jsonb;
  v_points_first integer;
  v_points_second integer;
  v_policy_stages integer;
  v_ok boolean := false;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'target season must equal source season + 1';
  end if;

  select count(*)::integer
  into v_before
  from public.races
  where extract(year from start_date)::integer=1999+p_target_season;

  begin
    v_first := public.prepare_next_season_race_calendar_v1(
      p_source_season,p_target_season,true
    );

    v_validate_first :=
      public.validate_season_calendar_stage_point_reconciliation_v3(
        p_source_season,p_target_season
      );

    select count(*)::integer
    into v_points_first
    from public.race_stage_points p
    join public.race_stages s on s.id=p.stage_id
    join public.races r on r.id=s.race_id
    where extract(year from r.start_date)::integer=1999+p_target_season
      and r.metadata->>'calendar_source_season'=p_source_season::text;

    v_second := public.prepare_next_season_race_calendar_v1(
      p_source_season,p_target_season,true
    );

    v_validate_second :=
      public.validate_season_calendar_stage_point_reconciliation_v3(
        p_source_season,p_target_season
      );

    select count(*)::integer
    into v_points_second
    from public.race_stage_points p
    join public.race_stages s on s.id=p.stage_id
    join public.races r on r.id=s.race_id
    where extract(year from r.start_date)::integer=1999+p_target_season
      and r.metadata->>'calendar_source_season'=p_source_season::text;

    select count(*)::integer
    into v_policy_stages
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where extract(year from r.start_date)::integer=1999+p_target_season
      and r.metadata->>'calendar_source_season'=p_source_season::text
      and s.metadata->>'sprint_layout_policy_version'='flat_random_2_4_v1';

    v_ok :=
      coalesce((v_first->>'ok')::boolean,false)
      and coalesce((v_second->>'ok')::boolean,false)
      and coalesce((v_validate_first->>'ok')::boolean,false)
      and coalesce((v_validate_second->>'ok')::boolean,false)
      and coalesce((v_validate_first->>'sprint_policy_invalid')::integer,-1)=0
      and coalesce((v_validate_second->>'sprint_policy_invalid')::integer,-1)=0
      and coalesce((v_first->'flat_sprint_layout'->>'randomized_stages')::integer,-1)=25
      and coalesce((v_second->'flat_sprint_layout'->>'randomized_stages')::integer,-1)=25
      and coalesce((v_first->'flat_sprint_layout'->>'future_sync_repairs')::integer,-1)=1
      and v_policy_stages=25
      and v_points_first=v_points_second;

    raise exception '__ROLLBACK_FLAT_SPRINT_LAYOUT_DRY_RUN__';
  exception when others then
    if sqlerrm<>'__ROLLBACK_FLAT_SPRINT_LAYOUT_DRY_RUN__' then
      raise;
    end if;
  end;

  select count(*)::integer
  into v_after
  from public.races
  where extract(year from start_date)::integer=1999+p_target_season;

  v_ok := v_ok and v_after=v_before;

  return jsonb_build_object(
    'ok',v_ok,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'first_prepare',v_first->'flat_sprint_layout',
    'first_validation',v_validate_first,
    'second_prepare',v_second->'flat_sprint_layout',
    'second_validation',v_validate_second,
    'points_after_first',v_points_first,
    'points_after_second',v_points_second,
    'policy_stages',v_policy_stages,
    'target_races_before',v_before,
    'target_races_after_rollback',v_after
  );
end;
$function$;


revoke all on function public.race_apply_future_flat_sprint_layout_v1(integer,integer,boolean)
from public,anon,authenticated;
grant execute on function public.race_apply_future_flat_sprint_layout_v1(integer,integer,boolean)
to service_role;

revoke all on function public.validate_season_calendar_stage_point_reconciliation_v3(integer,integer)
from public,anon,authenticated;
grant execute on function public.validate_season_calendar_stage_point_reconciliation_v3(integer,integer)
to service_role;

revoke all on function public.dry_run_future_flat_sprint_layout_v1(integer,integer)
from public,anon,authenticated;
grant execute on function public.dry_run_future_flat_sprint_layout_v1(integer,integer)
to service_role;

update public.race_stage_profile_details
set terrain_type=lower(trim(terrain_type))
where terrain_type is not null
  and terrain_type<>lower(trim(terrain_type));
