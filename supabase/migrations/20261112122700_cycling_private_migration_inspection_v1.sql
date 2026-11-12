-- ProPeloton Manager: strictly scoped inspection access during protected season migration.
-- This grants NO gameplay permissions, changes NO game clock, and never unlocks the site.
-- Authorized existing accounts are added separately in private production configuration.
CREATE TABLE IF NOT EXISTS private.cycling_migration_inspectors_v1 (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.cycling_migration_inspectors_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.cycling_migration_inspectors_v1 FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.is_cycling_migration_inspector_v1(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'private', 'auth', 'pg_temp'
AS $inspector$
  SELECT EXISTS (
    SELECT 1
    FROM private.cycling_migration_inspectors_v1 a
    JOIN auth.users u ON u.id=a.user_id
    WHERE a.user_id=p_user_id
      AND u.email_confirmed_at IS NOT NULL
      AND (u.banned_until IS NULL OR u.banned_until <= now())
  );
$inspector$;
REVOKE ALL ON FUNCTION private.is_cycling_migration_inspector_v1(uuid) FROM PUBLIC,anon,authenticated;

-- Keep normal players blocked. During migration, only explicitly approved
-- pre-existing users may create a login session. Account registration remains blocked.
CREATE OR REPLACE FUNCTION public.cycling_reject_new_session_during_migration_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $login$
DECLARE
  v_phase text;
BEGIN
  SELECT w.phase INTO v_phase
  FROM public.cycling_season_window_v1 w
  WHERE w.id=true;
  IF v_phase IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001',
      MESSAGE='Sign-in is unavailable while game availability cannot be verified.';
  END IF;
  IF v_phase IN ('migration','delayed')
     AND NOT private.is_cycling_migration_inspector_v1(NEW.user_id) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',
      MESSAGE='Sign-in is temporarily unavailable during the season migration. Please check the homepage for the reopening time.';
  END IF;
  RETURN NEW;
END
$login$;
REVOKE ALL ON FUNCTION public.cycling_reject_new_session_during_migration_v1() FROM PUBLIC,anon,authenticated;

-- Read-only, self-contained report. Never return information to unauthorised users.
-- No mutation commands are present in this function.
CREATE OR REPLACE FUNCTION public.get_cycling_admin_migration_inspection_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $report$
DECLARE
  v_uid uuid := auth.uid();
  w public.cycling_season_window_v1%rowtype;
  g public.game_state%rowtype;
  c public.game_clock_config%rowtype;
  r public.season_transition_engine_runs_v2%rowtype;
  v_races integer;
  v_stages integer;
  v_jan integer;
  v_source_snapshots integer;
  v_awards integer;
  v_source_rewards integer;
BEGIN
  IF v_uid IS NULL OR NOT private.is_cycling_migration_inspector_v1(v_uid) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Migration inspection is restricted to authorized accounts.';
  END IF;
  SELECT * INTO w FROM public.cycling_season_window_v1 WHERE id=true;
  IF NOT FOUND OR w.phase NOT IN ('migration','delayed') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Migration inspection is available only during the protected migration window.';
  END IF;
  SELECT * INTO g FROM public.game_state WHERE id=true;
  SELECT * INTO c FROM public.game_clock_config WHERE id=true;
  SELECT * INTO r FROM public.season_transition_engine_runs_v2 WHERE id=w.run_id;

  SELECT count(*) INTO v_races FROM public.races rr
    WHERE rr.start_date>=make_date(1999+w.target_season,1,1)
      AND rr.start_date<make_date(2000+w.target_season,1,1)
      AND rr.status<>'archived';
  SELECT count(*) INTO v_stages FROM public.race_stages s
    JOIN public.races rr ON rr.id=s.race_id
    WHERE rr.start_date>=make_date(1999+w.target_season,1,1)
      AND rr.start_date<make_date(2000+w.target_season,1,1)
      AND rr.status<>'archived';
  SELECT count(*) INTO v_jan FROM public.races rr
    WHERE rr.start_date>=make_date(1999+w.target_season,1,1)
      AND rr.start_date<make_date(1999+w.target_season,1,16)
      AND rr.status<>'archived';
  SELECT count(*) INTO v_source_snapshots
    FROM public.team_ranking_season_snapshots s
    WHERE s.season_number=w.source_season;
  SELECT count(*) INTO v_awards FROM public.race_ranking_point_awards a
    JOIN public.races rr ON rr.id=a.race_id
    WHERE rr.start_date>=make_date(1999+w.target_season,1,1)
      AND rr.start_date<make_date(2000+w.target_season,1,1);
  SELECT count(*) INTO v_source_rewards
    FROM public.club_season_reward_grants rwd
    WHERE rwd.source_season=w.source_season;

  RETURN jsonb_build_object(
    'authorized',true,
    'read_only',true,
    'checked_at',now(),
    'window_phase',w.phase,
    'migration_started_at',w.boundary_started_at,
    'earliest_reopen_at',w.migration_until_at,
    'game',jsonb_build_object(
      'season',g.season_number,'month',g.month_number,'day',g.day_number,
      'hour',g.hour_number,'minute',g.minute_number,'paused',g.is_paused,
      'clock_paused',c.is_paused,'speed_multiplier',c.speed_multiplier
    ),
    'migration',jsonb_build_object(
      'status',r.status,'completed_at',r.completed_at,
      'core_validated',coalesce((r.validation_report->'core'->>'ok')::boolean,false),
      'rewards_applied',coalesce((r.reward_report->>'ok')::boolean,false),
      'notifications_done',coalesce((r.communication_report->>'ok')::boolean,false),
      'final_validated',coalesce((r.validation_report->'final'->>'ok')::boolean,false)
    ),
    'snapshot_count',v_source_snapshots,
    'season2_race_count',v_races,
    'season2_stage_count',v_stages,
    'early_january_race_count',v_jan,
    'season2_ranking_awards',v_awards,
    'source_reward_grants',v_source_rewards
  );
END
$report$;
REVOKE ALL ON FUNCTION public.get_cycling_admin_migration_inspection_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_cycling_admin_migration_inspection_v1() TO authenticated;
