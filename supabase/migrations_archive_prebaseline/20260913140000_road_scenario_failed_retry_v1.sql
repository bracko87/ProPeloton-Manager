-- Road Scenario V1 failed-reservation retry correction.
-- A stage that abandoned a scenario because the emergency fallback became
-- authoritative may later be retried with the primary engine. Re-reserving that
-- stage must reactivate/update the failed audit row rather than returning a
-- stale failed selection as if it were still authoritative.

create or replace function public.universal_race_stage_reserve_scenario_v1(
  p_stage_id uuid,
  p_simulation_run_id uuid,
  p_audit jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stage public.race_stages%rowtype;
  v_existing public.race_engine_scenario_runs%rowtype;
  v_run public.race_stage_simulation_runs%rowtype;
  v_template_id text := nullif(p_audit->>'templateId','');
  v_family text := nullif(p_audit->>'templateFamily','');
  v_similarity_group text := nullif(p_audit->>'similarityGroup','');
  v_catalog text := nullif(p_audit->>'catalogVersion','');
  v_seed text := nullif(p_audit->>'selectionSeed','');
  v_type text := nullif(p_audit->>'scenarioType','');
  v_version integer := greatest(1, coalesce((p_audit->>'templateVersion')::integer,1));
  v_score numeric := coalesce((p_audit->>'compatibilityScore')::numeric,0);
  v_allow_race_repeat boolean := coalesce((p_audit->>'repeatAllowedRace')::boolean,false);
  v_allow_day_repeat boolean := coalesce((p_audit->>'repeatAllowedDay')::boolean,false);
  v_compatible_count integer := 0;
  v_race_used_compatible integer := 0;
  v_day_used_compatible integer := 0;
  v_race_collision uuid;
  v_day_collision uuid;
begin
  if p_stage_id is null or p_simulation_run_id is null then
    raise exception using errcode='22023', message='stage_id and simulation_run_id are required';
  end if;
  if v_type not in ('flat','hilly') then
    raise exception using errcode='22023', message='unsupported road scenario type';
  end if;
  if v_template_id is null or v_family is null or v_catalog is null or v_seed is null then
    raise exception using errcode='22023', message='road scenario audit is incomplete';
  end if;

  select * into v_stage from public.race_stages where id=p_stage_id;
  if not found then raise exception using errcode='P0002', message='stage not found'; end if;

  if lower(coalesce(v_stage.stage_format,'road_race')) <> 'road_race' then
    raise exception using errcode='22023', message='scenario reservation requires road_race stage format';
  end if;
  if lower(coalesce(v_stage.terrain_type,'')) <> v_type then
    raise exception using errcode='22023', message='scenario type does not match stage terrain type';
  end if;

  select * into v_run from public.race_stage_simulation_runs where id=p_simulation_run_id;
  if not found or v_run.stage_id<>p_stage_id or v_run.race_id<>v_stage.race_id then
    raise exception using errcode='22023', message='simulation run does not belong to stage';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('road_scenario:race:'||v_type||':'||v_stage.race_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('road_scenario:date:'||v_type||':'||v_stage.stage_date::text,0));

  select * into v_existing
  from public.race_engine_scenario_runs
  where stage_id=p_stage_id
  for update;

  if found and v_existing.selection_status in ('reserved','completed') then
    update public.race_engine_scenario_runs
    set simulation_run_id=p_simulation_run_id,
        updated_at=clock_timestamp()
    where id=v_existing.id;
    return jsonb_build_object(
      'status','existing',
      'stage_id',p_stage_id,
      'scenario_type',v_existing.scenario_type,
      'template_id',v_existing.template_id,
      'template_family',v_existing.template_family,
      'catalog_version',v_existing.catalog_version
    );
  end if;

  -- A failed row is intentionally ignored by anti-repeat history, but before
  -- reactivating it we still perform the same collision checks as a new row.
  select count(*) into v_compatible_count
  from jsonb_array_elements(coalesce(p_audit->'candidateScores','[]'::jsonb)) candidate
  where coalesce((candidate->>'rawScore')::numeric,-1) >= 42;

  if v_compatible_count > 0 then
    select count(distinct scenario.template_id) into v_race_used_compatible
    from public.race_engine_scenario_runs scenario
    where scenario.race_id=v_stage.race_id
      and scenario.stage_id<>p_stage_id
      and scenario.scenario_type=v_type
      and scenario.selection_status in ('reserved','completed')
      and scenario.template_id in (
        select candidate->>'templateId'
        from jsonb_array_elements(coalesce(p_audit->'candidateScores','[]'::jsonb)) candidate
        where coalesce((candidate->>'rawScore')::numeric,-1) >= 42
      );

    select count(distinct scenario.template_id) into v_day_used_compatible
    from public.race_engine_scenario_runs scenario
    where scenario.game_date=v_stage.stage_date
      and scenario.stage_id<>p_stage_id
      and scenario.scenario_type=v_type
      and scenario.selection_status in ('reserved','completed')
      and scenario.template_id in (
        select candidate->>'templateId'
        from jsonb_array_elements(coalesce(p_audit->'candidateScores','[]'::jsonb)) candidate
        where coalesce((candidate->>'rawScore')::numeric,-1) >= 42
      );

    if v_race_used_compatible >= v_compatible_count then v_allow_race_repeat := true; end if;
    if v_day_used_compatible >= v_compatible_count then v_allow_day_repeat := true; end if;
  end if;

  if not v_allow_race_repeat then
    select scenario.stage_id into v_race_collision
    from public.race_engine_scenario_runs scenario
    where scenario.race_id=v_stage.race_id
      and scenario.stage_id<>p_stage_id
      and scenario.scenario_type=v_type
      and scenario.template_id=v_template_id
      and scenario.selection_status in ('reserved','completed')
    order by scenario.selected_at
    limit 1;
    if v_race_collision is not null then
      return jsonb_build_object('status','collision','scope','race','scenario_type',v_type,'template_id',v_template_id,'conflicting_stage_id',v_race_collision);
    end if;
  end if;

  if not v_allow_day_repeat then
    select scenario.stage_id into v_day_collision
    from public.race_engine_scenario_runs scenario
    where scenario.game_date=v_stage.stage_date
      and scenario.stage_id<>p_stage_id
      and scenario.scenario_type=v_type
      and scenario.template_id=v_template_id
      and scenario.selection_status in ('reserved','completed')
    order by scenario.selected_at
    limit 1;
    if v_day_collision is not null then
      return jsonb_build_object('status','collision','scope','day','scenario_type',v_type,'template_id',v_template_id,'conflicting_stage_id',v_day_collision);
    end if;
  end if;

  if found and v_existing.selection_status='failed' then
    update public.race_engine_scenario_runs
    set simulation_run_id=p_simulation_run_id,
        race_id=v_stage.race_id,
        game_date=v_stage.stage_date,
        scenario_type=v_type,
        template_id=v_template_id,
        template_version=v_version,
        template_family=v_family,
        similarity_group=coalesce(v_similarity_group,''),
        catalog_version=v_catalog,
        selection_seed=v_seed,
        compatibility_score=v_score,
        context_snapshot_json=coalesce(p_audit->'contextSnapshot','{}'::jsonb),
        candidate_scores_json=coalesce(p_audit->'candidateScores','[]'::jsonb),
        repetition_penalties_json=coalesce(p_audit->'repetitionPenalties','{}'::jsonb),
        generated_parameters_json=coalesce(p_audit->'generatedParameters','{}'::jsonb),
        applied_directives_json=coalesce(p_audit->'appliedDirectives','{}'::jsonb),
        selection_status='reserved',
        actual_outcome_json=null,
        completed_at=null,
        selected_at=clock_timestamp(),
        scenario_deviations_json=coalesce(v_existing.scenario_deviations_json,'[]'::jsonb) ||
          jsonb_build_array(jsonb_build_object('kind','scenario_retry_reactivated','at',clock_timestamp())),
        updated_at=clock_timestamp()
    where id=v_existing.id;

    return jsonb_build_object(
      'status','reserved',
      'reactivated',true,
      'stage_id',p_stage_id,
      'scenario_type',v_type,
      'template_id',v_template_id,
      'template_family',v_family,
      'catalog_version',v_catalog
    );
  end if;

  insert into public.race_engine_scenario_runs(
    simulation_run_id,race_id,stage_id,game_date,scenario_type,template_id,template_version,
    template_family,similarity_group,catalog_version,selection_seed,compatibility_score,
    context_snapshot_json,candidate_scores_json,repetition_penalties_json,
    generated_parameters_json,applied_directives_json,selection_status
  ) values (
    p_simulation_run_id,v_stage.race_id,p_stage_id,v_stage.stage_date,v_type,v_template_id,v_version,
    v_family,coalesce(v_similarity_group,''),v_catalog,v_seed,v_score,
    coalesce(p_audit->'contextSnapshot','{}'::jsonb),
    coalesce(p_audit->'candidateScores','[]'::jsonb),
    coalesce(p_audit->'repetitionPenalties','{}'::jsonb),
    coalesce(p_audit->'generatedParameters','{}'::jsonb),
    coalesce(p_audit->'appliedDirectives','{}'::jsonb),'reserved'
  );

  return jsonb_build_object(
    'status','reserved',
    'reactivated',false,
    'stage_id',p_stage_id,
    'scenario_type',v_type,
    'template_id',v_template_id,
    'template_family',v_family,
    'catalog_version',v_catalog
  );
end;
$$;

revoke all on function public.universal_race_stage_reserve_scenario_v1(uuid,uuid,jsonb) from public;
grant execute on function public.universal_race_stage_reserve_scenario_v1(uuid,uuid,jsonb) to service_role;
