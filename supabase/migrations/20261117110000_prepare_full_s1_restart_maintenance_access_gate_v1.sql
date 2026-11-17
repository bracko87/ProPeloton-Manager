-- Full Season 1 restart maintenance gate, DEFAULT OFF.
-- No change to Auth, game clock, gameplay or sessions until explicitly activated
-- by verified backup signoffs. No speculative reopening date.

CREATE TABLE IF NOT EXISTS private.game_world_reset_maintenance_gate_v1 (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 locked boolean NOT NULL DEFAULT false,
 reset_run_id uuid REFERENCES public.game_world_reset_runs(id),
 locked_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.game_world_reset_maintenance_gate_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.game_world_reset_maintenance_gate_v1 FROM PUBLIC,anon,authenticated;
INSERT INTO private.game_world_reset_maintenance_gate_v1(id,locked) VALUES(true,false)
ON CONFLICT(id) DO NOTHING;


-- get_cycling_public_season_window_v1()
CREATE OR REPLACE FUNCTION public.get_cycling_public_season_window_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
SELECT jsonb_build_object(
 'phase',CASE WHEN coalesce(g.locked,false) THEN 'reset_maintenance' ELSE w.phase END,
 'restart_locked',coalesce(g.locked,false),
 'locked',coalesce(g.locked,false) OR w.phase IN ('migration','delayed'),
 'preparation_active',NOT coalesce(g.locked,false) AND w.phase='preparation',
 'game_clock_paused',coalesce(g.locked,false) OR w.phase IN ('migration','delayed','preparation'),
 'source_season',CASE WHEN coalesce(g.locked,false) THEN (SELECT season_number FROM public.game_state WHERE id=true)
     WHEN w.phase='off' THEN null ELSE w.source_season END,
 'target_season',CASE WHEN coalesce(g.locked,false) THEN 1 WHEN w.phase='off' THEN null ELSE w.target_season END,
 'migration_started_at',CASE WHEN coalesce(g.locked,false) THEN g.locked_at
     WHEN w.phase='off' THEN null ELSE w.boundary_started_at END,
 'migration_reopen_at',CASE WHEN coalesce(g.locked,false) OR w.phase='off' THEN null ELSE w.migration_until_at END,
 'preparation_started_at',CASE WHEN NOT coalesce(g.locked,false) AND w.phase='preparation' THEN w.preparation_started_at ELSE null END,
 'resume_at',CASE WHEN NOT coalesce(g.locked,false) AND w.phase='preparation' THEN w.resume_at ELSE null END,
 'delayed',w.phase='delayed' AND NOT coalesce(g.locked,false),
 'checked_at',now()
)
FROM public.cycling_season_window_v1 w
LEFT JOIN private.game_world_reset_maintenance_gate_v1 g ON g.id=true
WHERE w.id=true;
$function$;

-- cycling_reject_new_session_during_migration_v1()
CREATE OR REPLACE FUNCTION public.cycling_reject_new_session_during_migration_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_phase text;
BEGIN
  IF EXISTS(SELECT 1 FROM private.game_world_reset_maintenance_gate_v1 WHERE id=true AND locked=true) THEN
    RAISE EXCEPTION USING ERRCODE='P0001',
      MESSAGE='Sign-in is unavailable while Season 1 is being safely restarted.';
  END IF;
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
$function$;

-- private.game_world_reset_activate_maintenance_v1(uuid)
CREATE OR REPLACE FUNCTION private.game_world_reset_activate_maintenance_v1(p_reset_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.game_world_reset_runs
   WHERE id=p_reset_run_id AND status='preflight'
 ) THEN RAISE EXCEPTION 'Maintenance can only start from a prepared preflight reset'; END IF;

 IF NOT EXISTS (
   SELECT 1 FROM private.game_world_reset_execution_signoffs_v1 s
   WHERE s.reset_run_id=p_reset_run_id AND s.backup_verified=true
     AND length(btrim(coalesce(s.backup_reference,'')))>5
     AND s.player_clubs_preserved=true AND s.national_calendar_rebuild_verified=true
     AND s.reset_validator_updated=true AND s.signed_off_at IS NOT NULL
 ) THEN RAISE EXCEPTION 'Maintenance cannot start without verified backup and approved restart checks'; END IF;

 UPDATE private.game_world_reset_maintenance_gate_v1
 SET locked=true,locked_at=coalesce(locked_at,now()),
     reset_run_id=p_reset_run_id,updated_at=now()
 WHERE id=true AND (locked=false OR reset_run_id=p_reset_run_id);

 IF NOT FOUND THEN RAISE EXCEPTION 'Another reset owns the maintenance lock'; END IF;

 RETURN jsonb_build_object('ok',true,'restart_locked',true,'reset_run_id',p_reset_run_id);
END;
$function$;

REVOKE ALL ON FUNCTION private.game_world_reset_activate_maintenance_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.game_world_reset_activate_maintenance_v1(uuid) TO service_role;
