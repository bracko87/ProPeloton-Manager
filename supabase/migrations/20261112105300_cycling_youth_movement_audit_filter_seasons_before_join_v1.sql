-- Fix Youth Academy movement audit FULL JOIN: qualify both source and
-- target tables before joining, so old-season memberships are not counted
-- as new entries. Current production audit included 80 stale memberships
-- and five duplicated academies. Keep the UNIQUE constraint unchanged.
DO $guard$
DECLARE v_src text;
BEGIN
 SELECT pg_get_functiondef('private.log_youth_transition_movements_v1(uuid,integer,integer)'::regprocedure) INTO v_src;
 IF v_src IS NULL OR
 (length(v_src)-length(replace(v_src,'  from public.youth_team_standing_history_v1 s
  full join public.youth_academy_competition_memberships t
    on t.academy_id=s.academy_id
   and t.season_number=p_target_season
  where s.snapshot_season=p_source_season
     or s.academy_id is null;','')))/length('  from public.youth_team_standing_history_v1 s
  full join public.youth_academy_competition_memberships t
    on t.academy_id=s.academy_id
   and t.season_number=p_target_season
  where s.snapshot_season=p_source_season
     or s.academy_id is null;')<>1
 THEN RAISE EXCEPTION 'Youth movement audit baseline mismatch'; END IF;
 EXECUTE replace(v_src,'  from public.youth_team_standing_history_v1 s
  full join public.youth_academy_competition_memberships t
    on t.academy_id=s.academy_id
   and t.season_number=p_target_season
  where s.snapshot_season=p_source_season
     or s.academy_id is null;','  from (select * from public.youth_team_standing_history_v1
        where snapshot_season=p_source_season) s
  full join (select * from public.youth_academy_competition_memberships
        where season_number=p_target_season) t
    on t.academy_id=s.academy_id;');
END $guard$;