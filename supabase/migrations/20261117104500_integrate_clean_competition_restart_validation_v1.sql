
DO $patch$
DECLARE
 v_sql text;
 v_cleanup_anchor text:=E'    delete from public.races where start_date >= date ''2001-01-01'';\n';
 v_rebuild_anchor text:=E'    update public.game_world_reset_runs\n    set status=''teams_rebuilt'',updated_at=clock_timestamp()';
BEGIN
 SELECT pg_get_functiondef('public.game_world_reset_execute_core_v1(uuid,text)'::regprocedure)
 INTO v_sql;
 IF v_sql IS NULL OR position('private.game_world_reset_execute_guard_v1(p_reset_run_id)' IN v_sql)=0
 THEN RAISE EXCEPTION 'Guarded reset core missing; refusing unsafe patch'; END IF;

 IF position('private.game_world_reset_cleanup_national_competitions_v1(p_reset_run_id)' IN v_sql)=0 THEN
  IF (length(v_sql)-length(replace(v_sql,v_cleanup_anchor,'')))/length(v_cleanup_anchor)<>1
  THEN RAISE EXCEPTION 'Unexpected reset cleanup anchor'; END IF;
  v_sql:=replace(v_sql,v_cleanup_anchor,
    v_cleanup_anchor||E'\n    -- Clear old championship and World Nations runtime; preserve hidden source routes.\n    perform private.game_world_reset_cleanup_national_competitions_v1(p_reset_run_id);\n');
 END IF;

 IF position('private.game_world_reset_rebuild_national_competitions_v1(p_reset_run_id)' IN v_sql)=0 THEN
  IF (length(v_sql)-length(replace(v_sql,v_rebuild_anchor,'')))/length(v_rebuild_anchor)<>1
  THEN RAISE EXCEPTION 'Unexpected reset reconstruction anchor'; END IF;
  v_sql:=replace(v_sql,v_rebuild_anchor,
    E'    -- Rebuild all 150 national championships, World Road and World Nations.\n    perform private.game_world_reset_rebuild_national_competitions_v1(p_reset_run_id);\n\n'||v_rebuild_anchor);
 END IF;
 EXECUTE v_sql;
END $patch$;

REVOKE ALL ON FUNCTION public.game_world_reset_execute_core_v1(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.game_world_reset_execute_core_v1(uuid,text) TO service_role;

-- Full-world validator requires all freshly generated nations, World Road,
-- and World Nations plus zero previous standings/ranking points.

CREATE OR REPLACE FUNCTION public.game_world_reset_validate_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance'
AS $function$
declare
  v_base jsonb;
  v_bad_club_cash bigint;
  v_bad_account_cash bigint;
  v_bad_summary bigint;
  v_backlog_rows bigint;
  v_hourly_rows bigint;
  v_day_rows bigint;
  v_race_runtime_flags bigint;
  v_forward_activation_bad bigint;
  v_race_activation_bad bigint;
  v_national_total bigint;
  v_national_ready bigint;
  v_missing_national_countries bigint;
  v_missing_national_riders bigint;
  v_world_road_ready bigint;
  v_nations_ready bigint;
  v_nations_history bigint;
  v_nations_points bigint;
  v_ok boolean;
begin
  v_base:=public.game_world_reset_validate_v1();

  with expected as (
    select c.id,
      case when c.is_ai or c.owner_user_id is null or c.club_type='developing' then 0::numeric
           else coalesce(tbp.starting_cash_user,0)::numeric end as expected_cash,
      c.cash_balance
    from public.clubs c
    join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=c.id
    left join public.team_tier_balance_profiles tbp on tbp.tier_key=public._get_club_balance_tier_key(c.id)
  ) select count(*) into v_bad_club_cash from expected where coalesce(cash_balance,0)<>expected_cash;

  with expected as (
    select c.id,
      case when c.is_ai or c.owner_user_id is null or c.club_type='developing' then 0::numeric
           else coalesce(tbp.starting_cash_user,0)::numeric end as expected_cash
    from public.clubs c
    join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=c.id
    left join public.team_tier_balance_profiles tbp on tbp.tier_key=public._get_club_balance_tier_key(c.id)
  ), acct as (
    select a.club_id,coalesce(ab.balance,0)::numeric as balance
    from finance.accounts a join finance.account_balances ab on ab.account_id=a.id
    where a.currency='CASH' and a.kind='main' and a.club_id is not null
  ) select count(*) into v_bad_account_cash from expected e left join acct a on a.club_id=e.id
    where coalesce(a.balance,0)<>e.expected_cash;

  with expected as (
    select c.id,
      case when c.is_ai or c.owner_user_id is null or c.club_type='developing' then 0::numeric
           else coalesce(tbp.starting_cash_user,0)::numeric end as expected_cash
    from public.clubs c
    join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=c.id
    left join public.team_tier_balance_profiles tbp on tbp.tier_key=public._get_club_balance_tier_key(c.id)
  ) select count(*) into v_bad_summary from expected e left join public.club_finance_summary s on s.club_id=e.id
    where coalesce(s.current_balance,0)<>e.expected_cash;

  select count(*) into v_backlog_rows from public.game_daily_tick_backlog_v1;
  select count(*) into v_hourly_rows from public.hourly_game_processor_runs;
  select count(*) into v_day_rows from public.game_day_processor_runs;

  select count(*) into v_race_runtime_flags
  from public.races r
  where r.start_date>=date '2000-01-01' and r.start_date<date '2001-01-01'
    and coalesce(r.metadata,'{}'::jsonb) ?| array[
      'team_list_announcement_finalized','team_list_announcement_processed',
      'race_startlist_captains_finalized','captains_pending_rider_deadline',
      'forward_only_terminal_closure'
    ];

  select count(*) into v_forward_activation_bad
  from public.automation_forward_activation_v1 a
  where a.id=true and (
    a.activated_game_date<>date '2000-01-01'
    or a.daily_processing_starts_on<>date '2000-01-02'
    or a.activated_game_timestamp<>timestamptz '2000-01-01 01:00:00+00'
  );

  select count(*) into v_race_activation_bad
  from public.race_engine_runtime_control_v1 c
  where c.singleton_id=true
    and c.active_engine='typescript_v1'
    and coalesce(c.typescript_lifecycle_enabled,false)=true
    and c.typescript_activation_game_at is distinct from timestamp '2000-01-01 01:00:00';


  SELECT count(*),count(*) FILTER (
    WHERE e.status='planned' AND e.route_status='ready'
      AND e.climate_status='ready' AND e.final_source_stage_id IS NOT NULL
  ) INTO v_national_total,v_national_ready
  FROM public.national_championship_editions e
  WHERE e.season_number=1 AND e.discipline='road';

  SELECT count(*) INTO v_missing_national_countries
  FROM private.game_world_reset_national_countries_v1 c
  WHERE NOT EXISTS(SELECT 1 FROM public.national_championship_editions e
    WHERE e.season_number=1 AND e.discipline='road' AND e.country_code=c.country_code);
  SELECT count(*) INTO v_missing_national_riders
  FROM private.game_world_reset_national_countries_v1 c
  WHERE NOT EXISTS(SELECT 1 FROM public.riders r WHERE upper(r.country_code)=c.country_code);

  SELECT count(*) INTO v_world_road_ready
  FROM public.world_road_championship_editions e
  JOIN public.races r ON r.id=e.race_id
  WHERE e.season_number=1 AND e.route_status='ready'
    AND r.status='scheduled' AND r.category='WRC';

  SELECT count(*) INTO v_nations_ready
  FROM public.nations_competition_editions e
  WHERE e.season_number=1 AND e.status='planned';

  SELECT (SELECT count(*) FROM public.nations_competition_history)
      + (SELECT count(*) FROM public.nations_team_standing_history)
  INTO v_nations_history;
  SELECT count(*) INTO v_nations_points FROM public.nations_team_ranking_points;

  v_ok:=coalesce((v_base->>'ok')::boolean,false)
        and v_bad_club_cash=0 and v_bad_account_cash=0 and v_bad_summary=0
        and v_backlog_rows=0 and v_hourly_rows=0 and v_day_rows=0
        and v_race_runtime_flags=0 and v_forward_activation_bad=0 and v_race_activation_bad=0
        and v_national_total=150 and v_national_ready=150
        and v_missing_national_countries=0 and v_missing_national_riders=0
        and v_world_road_ready=1 and v_nations_ready=1
        and v_nations_history=0 and v_nations_points=0;

  return v_base || jsonb_build_object(
    'ok',v_ok,
    'bad_club_starting_cash',v_bad_club_cash,
    'bad_finance_account_starting_cash',v_bad_account_cash,
    'bad_finance_summary_starting_cash',v_bad_summary,
    'runtime_backlog_rows',v_backlog_rows,
    'runtime_hourly_processor_runs',v_hourly_rows,
    'runtime_daily_processor_runs',v_day_rows,
    'runtime_race_metadata_flags',v_race_runtime_flags,
    'forward_activation_bad',v_forward_activation_bad,
    'typescript_activation_bad',v_race_activation_bad,
    'fresh_s1_national_editions',v_national_total,
    'fresh_s1_national_routes_ready',v_national_ready,
    'fresh_s1_countries_missing_editions',v_missing_national_countries,
    'fresh_s1_countries_missing_riders',v_missing_national_riders,
    'fresh_s1_world_road_ready',v_world_road_ready,
    'fresh_s1_nations_edition_ready',v_nations_ready,
    'old_nations_history_rows',v_nations_history,
    'old_nations_ranking_points',v_nations_points
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.game_world_reset_validate_v2() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.game_world_reset_validate_v2() TO service_role;
