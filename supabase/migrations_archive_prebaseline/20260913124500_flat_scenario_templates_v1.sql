-- Flat Scenario Template System V1
-- Stores one authoritative scenario selection per stage and provides
-- concurrency-safe history/reservation RPCs for the Supabase race runner.

create table if not exists public.race_engine_scenario_runs (
  id uuid primary key default gen_random_uuid(),
  simulation_run_id uuid not null references public.race_stage_simulation_runs(id) on delete cascade,
  race_id uuid not null references public.races(id) on delete cascade,
  stage_id uuid not null references public.race_stages(id) on delete cascade,
  game_date date not null,
  scenario_type text not null,
  template_id text not null,
  template_version integer not null,
  template_family text not null,
  similarity_group text not null,
  catalog_version text not null,
  selection_seed text not null,
  compatibility_score numeric not null,
  context_snapshot_json jsonb not null default '{}'::jsonb,
  candidate_scores_json jsonb not null default '[]'::jsonb,
  repetition_penalties_json jsonb not null default '{}'::jsonb,
  generated_parameters_json jsonb not null default '{}'::jsonb,
  applied_directives_json jsonb not null default '{}'::jsonb,
  selection_status text not null default 'reserved',
  scenario_deviations_json jsonb not null default '[]'::jsonb,
  actual_outcome_json jsonb,
  selected_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  constraint race_engine_scenario_runs_stage_unique unique(stage_id),
  constraint race_engine_scenario_runs_simulation_unique unique(simulation_run_id),
  constraint race_engine_scenario_runs_status_check check (selection_status in ('reserved','completed','failed')),
  constraint race_engine_scenario_runs_type_check check (scenario_type in ('flat')),
  constraint race_engine_scenario_runs_template_version_check check (template_version > 0)
);

create index if not exists race_engine_scenario_runs_race_date_idx
  on public.race_engine_scenario_runs(race_id, game_date, selected_at);
create index if not exists race_engine_scenario_runs_date_template_idx
  on public.race_engine_scenario_runs(game_date, template_id, selected_at);
create index if not exists race_engine_scenario_runs_race_template_idx
  on public.race_engine_scenario_runs(race_id, template_id, selected_at);

alter table public.race_engine_scenario_runs enable row level security;
revoke all on table public.race_engine_scenario_runs from anon, authenticated;

create or replace function public.universal_race_stage_scenario_history_v1(
  p_race_id uuid,
  p_game_date date
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'raceId', scenario.race_id,
        'stageId', scenario.stage_id,
        'gameDate', scenario.game_date,
        'templateId', scenario.template_id,
        'family', scenario.template_family,
        'status', scenario.selection_status
      )
      order by scenario.game_date, scenario.selected_at, scenario.stage_id
    ),
    '[]'::jsonb
  )
  from public.race_engine_scenario_runs scenario
  where scenario.scenario_type = 'flat'
    and scenario.selection_status in ('reserved','completed')
    and (
      scenario.race_id = p_race_id
      or (p_game_date is not null and scenario.game_date = p_game_date)
    );
$$;

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
  v_type text := coalesce(nullif(p_audit->>'scenarioType',''),'flat');
  v_version integer := greatest(1, coalesce((p_audit->>'templateVersion')::integer,1));
  v_score numeric := coalesce((p_audit->>'compatibilityScore')::numeric,0);
  v_allow_race_repeat boolean := coalesce((p_audit->>'repeatAllowedRace')::boolean,false);
  v_allow_day_repeat boolean := coalesce((p_audit->>'repeatAllowedDay')::boolean,false);
  v_race_collision uuid;
  v_day_collision uuid;
begin
  if p_stage_id is null or p_simulation_run_id is null then
    raise exception using errcode='22023', message='stage_id and simulation_run_id are required';
  end if;
  if v_template_id is null or v_family is null or v_catalog is null or v_seed is null then
    raise exception using errcode='22023', message='flat scenario audit is incomplete';
  end if;
  if v_type <> 'flat' then
    raise exception using errcode='22023', message='unsupported scenario type';
  end if;

  select * into v_stage from public.race_stages where id=p_stage_id;
  if not found then raise exception using errcode='P0002', message='stage not found'; end if;
  select * into v_run from public.race_stage_simulation_runs where id=p_simulation_run_id;
  if not found or v_run.stage_id<>p_stage_id or v_run.race_id<>v_stage.race_id then
    raise exception using errcode='22023', message='simulation run does not belong to stage';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('flat_scenario:race:'||v_stage.race_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('flat_scenario:date:'||v_stage.stage_date::text,0));

  select * into v_existing
  from public.race_engine_scenario_runs
  where stage_id=p_stage_id
  for update;

  if found then
    update public.race_engine_scenario_runs
    set simulation_run_id=p_simulation_run_id,
        updated_at=clock_timestamp()
    where id=v_existing.id;
    return jsonb_build_object(
      'status','existing',
      'stage_id',p_stage_id,
      'template_id',v_existing.template_id,
      'template_family',v_existing.template_family,
      'catalog_version',v_existing.catalog_version
    );
  end if;

  if not v_allow_race_repeat then
    select scenario.stage_id into v_race_collision
    from public.race_engine_scenario_runs scenario
    where scenario.race_id=v_stage.race_id
      and scenario.stage_id<>p_stage_id
      and scenario.scenario_type='flat'
      and scenario.template_id=v_template_id
      and scenario.selection_status in ('reserved','completed')
    order by scenario.selected_at
    limit 1;
    if v_race_collision is not null then
      return jsonb_build_object('status','collision','scope','race','template_id',v_template_id,'conflicting_stage_id',v_race_collision);
    end if;
  end if;

  if not v_allow_day_repeat then
    select scenario.stage_id into v_day_collision
    from public.race_engine_scenario_runs scenario
    where scenario.game_date=v_stage.stage_date
      and scenario.stage_id<>p_stage_id
      and scenario.scenario_type='flat'
      and scenario.template_id=v_template_id
      and scenario.selection_status in ('reserved','completed')
    order by scenario.selected_at
    limit 1;
    if v_day_collision is not null then
      return jsonb_build_object('status','collision','scope','day','template_id',v_template_id,'conflicting_stage_id',v_day_collision);
    end if;
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

  return jsonb_build_object('status','reserved','stage_id',p_stage_id,'template_id',v_template_id,'template_family',v_family,'catalog_version',v_catalog);
end;
$$;

create or replace function public.universal_race_stage_finalize_scenario_v1(
  p_stage_id uuid,
  p_simulation_run_id uuid,
  p_actual_outcome jsonb default '{}'::jsonb,
  p_deviations jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated public.race_engine_scenario_runs%rowtype;
begin
  update public.race_engine_scenario_runs
  set simulation_run_id=p_simulation_run_id,
      selection_status='completed',
      actual_outcome_json=coalesce(p_actual_outcome,'{}'::jsonb),
      scenario_deviations_json=coalesce(p_deviations,'[]'::jsonb),
      completed_at=coalesce(completed_at,clock_timestamp()),
      updated_at=clock_timestamp()
  where stage_id=p_stage_id
  returning * into v_updated;

  if not found then
    return jsonb_build_object('status','not_found','stage_id',p_stage_id);
  end if;
  return jsonb_build_object('status','completed','stage_id',p_stage_id,'template_id',v_updated.template_id);
end;
$$;

revoke all on function public.universal_race_stage_scenario_history_v1(uuid,date) from public;
revoke all on function public.universal_race_stage_reserve_scenario_v1(uuid,uuid,jsonb) from public;
revoke all on function public.universal_race_stage_finalize_scenario_v1(uuid,uuid,jsonb,jsonb) from public;
grant execute on function public.universal_race_stage_scenario_history_v1(uuid,date) to service_role;
grant execute on function public.universal_race_stage_reserve_scenario_v1(uuid,uuid,jsonb) to service_role;
grant execute on function public.universal_race_stage_finalize_scenario_v1(uuid,uuid,jsonb,jsonb) to service_role;
