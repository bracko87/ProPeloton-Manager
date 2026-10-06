-- Final guardrails for extended Season Transition modules v13:
-- dynamic Youth/National preflight + legacy recovery phase parity.

create or replace function public.season_transition_extended_modules_preflight_v1(
  p_source_season integer,
  p_target_season integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_source_world integer:=0;
  v_source_west integer:=0;
  v_source_east integer:=0;
  v_playoff_pool integer:=0;
  v_target_youth_prizes integer:=0;
  v_target_youth_results integer:=0;
  v_target_nations_point_rows integer:=0;
  v_target_nations_points bigint:=0;
  v_target_nc_snapshots integer:=0;
  v_target_nc_entries integer:=0;
  v_target_nc_duties integer:=0;
  v_target_nc_results integer:=0;
  v_ok boolean:=false;
begin
  select count(*) into v_source_world
  from public.youth_academy_competition_memberships
  where season_number=p_source_season and competition_class='world';

  select count(*) into v_source_west
  from public.youth_academy_competition_memberships
  where season_number=p_source_season and division_code='CONTINENTAL_WEST';

  select count(*) into v_source_east
  from public.youth_academy_competition_memberships
  where season_number=p_source_season and division_code='CONTINENTAL_EAST';

  select coalesce((public.preview_youth_season_transition_v2(
    p_source_season
  )->>'continental_playoff_pool_size')::integer,0)
  into v_playoff_pool;

  select count(*) into v_target_youth_prizes
  from public.youth_race_team_prizes p
  join public.youth_races r on r.id=p.race_id
  where r.season_number=p_target_season;

  select count(*) into v_target_youth_results
  from public.youth_race_results rr
  join public.youth_races r on r.id=rr.race_id
  where r.season_number=p_target_season;

  select count(*),coalesce(sum(points),0)::bigint
  into v_target_nations_point_rows,v_target_nations_points
  from public.nations_team_ranking_points
  where season_number=p_target_season;

  select count(*) into v_target_nc_snapshots
  from public.national_championship_ranking_snapshots s
  join public.national_championship_editions e on e.id=s.edition_id
  where e.season_number=p_target_season;

  select count(*) into v_target_nc_entries
  from public.national_championship_entries en
  join public.national_championship_editions e on e.id=en.edition_id
  where e.season_number=p_target_season;

  select count(*) into v_target_nc_duties
  from public.national_championship_duties d
  join public.national_championship_editions e on e.id=d.edition_id
  where e.season_number=p_target_season;

  select count(*) into v_target_nc_results
  from public.national_championship_result_history h
  join public.national_championship_editions e on e.id=h.edition_id
  where e.season_number=p_target_season;

  v_ok:=
    p_target_season=p_source_season+1
    and v_source_world=16
    and v_source_west=20
    and v_source_east=20
    and v_playoff_pool=6
    and v_target_youth_prizes=0
    and v_target_youth_results=0
    and v_target_nations_point_rows=0
    and v_target_nations_points=0
    and v_target_nc_snapshots=0
    and v_target_nc_entries=0
    and v_target_nc_duties=0
    and v_target_nc_results=0;

  return jsonb_build_object(
    'ok',v_ok,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'youth_source',jsonb_build_object(
      'world_teams',v_source_world,
      'continental_west_teams',v_source_west,
      'continental_east_teams',v_source_east,
      'continental_playoff_pool_size',v_playoff_pool
    ),
    'target_freshness',jsonb_build_object(
      'youth_team_point_rows',v_target_youth_prizes,
      'youth_result_rows',v_target_youth_results,
      'nations_point_rows',v_target_nations_point_rows,
      'nations_points',v_target_nations_points,
      'national_ranking_snapshots',v_target_nc_snapshots,
      'national_entries',v_target_nc_entries,
      'national_duties',v_target_nc_duties,
      'national_results',v_target_nc_results
    )
  );
end;
$function$;

do $patch_preflight$
declare
  ddl text;
begin
  ddl:=pg_get_functiondef(
    'public.season_transition_engine_preflight_v2(integer,integer,text)'::regprocedure
  );

  if position('v_extended_modules jsonb;' in ddl)=0 then
    ddl:=replace(
      ddl,
      'v_live_fingerprint jsonb;',
      'v_live_fingerprint jsonb;'||chr(10)||'  v_extended_modules jsonb;'
    );
  end if;

  if position('v_extended_modules := public.season_transition_extended_modules_preflight_v1' in ddl)=0 then
    ddl:=replace(
      ddl,
      'v_live_fingerprint := public.season_transition_engine_live_fingerprint_v2(p_target_season);',
      'v_live_fingerprint := public.season_transition_engine_live_fingerprint_v2(p_target_season);'||
      chr(10)||'  v_extended_modules := public.season_transition_extended_modules_preflight_v1(p_source_season,p_target_season);'
    );
  end if;

  ddl:=replace(
    ddl,
    '''ok'',v_pair_ok and v_mode_ok and v_ready_components and v_guard_ok and v_context_ok,',
    '''ok'',v_pair_ok and v_mode_ok and v_ready_components and v_guard_ok and v_context_ok and coalesce((v_extended_modules->>''ok'')::boolean,false),'
  );

  if position('''extended_modules'',v_extended_modules' in ddl)=0 then
    ddl:=replace(
      ddl,
      '''persistence'',v_persistence,',
      '''persistence'',v_persistence,'||chr(10)||'    ''extended_modules'',v_extended_modules,'
    );
  end if;

  execute ddl;
end;
$patch_preflight$;

do $patch_recovery_phase1$
declare
  ddl text;
begin
  ddl:=pg_get_functiondef(
    'public.execute_season_transition_recovery_phase1_v1(uuid,integer,integer)'::regprocedure
  );

  if position('v_youth jsonb' in ddl)=0 then
    ddl:=replace(
      ddl,
      'v_sponsor jsonb; v_dev jsonb; v_fin jsonb; v_snapshot integer;',
      'v_sponsor jsonb; v_dev jsonb; v_youth jsonb; v_nations jsonb; v_national_rankings jsonb; v_fin jsonb; v_snapshot integer;'
    );
  end if;

  if position('run_national_association_season_transition_v2' in ddl)=0 then
    ddl:=replace(
      ddl,
      'v_comp:=public.run_competition_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);',
      'v_comp:=public.run_competition_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);'||
      chr(10)||'    v_nations:=public.run_national_association_season_transition_v2(p_transition_run_id,p_source_season,p_target_season);'||
      chr(10)||'    v_national_rankings:=public.run_national_ranking_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);'
    );
  end if;

  if position('v_youth:=public.run_youth_academy_season_transition_v1' in ddl)=0 then
    ddl:=replace(
      ddl,
      'v_dev:=public.run_developing_team_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);',
      'v_dev:=public.run_developing_team_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);'||
      chr(10)||'    v_youth:=public.run_youth_academy_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);'
    );
  end if;

  ddl:=replace(
    ddl,
    '''competition'',v_comp,',
    '''competition'',v_comp,''national_associations_world_nations'',v_nations,''national_rankings_championships'',v_national_rankings,'
  );

  ddl:=replace(
    ddl,
    '''developing_team'',v_dev,''finances_rewards'',v_fin',
    '''developing_team'',v_dev,''youth_academy'',v_youth,''finances_rewards'',v_fin'
  );

  execute ddl;
end;
$patch_recovery_phase1$;
