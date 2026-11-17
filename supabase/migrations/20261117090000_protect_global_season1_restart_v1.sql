-- Full-world Season 1 restart safety hardening.
-- Installed and verified on live ProPeloton Manager, November 17, 2026.
-- These statements are idempotent and do not reset any game data.
-- Ordinary players must never be allowed to call security-definer world resets.

DO $restrict$
DECLARE
 rec record;
BEGIN
 FOR rec IN
  SELECT p.oid::regprocedure::text AS signature
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname LIKE 'game_world_reset_%'
 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated',rec.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role',rec.signature);
 END LOOP;
END $restrict$;

CREATE TABLE IF NOT EXISTS private.game_world_reset_execution_signoffs_v1 (
  reset_run_id uuid PRIMARY KEY REFERENCES public.game_world_reset_runs(id) ON DELETE RESTRICT,
  backup_verified boolean NOT NULL DEFAULT false,
  player_clubs_preserved boolean NOT NULL DEFAULT false,
  national_calendar_rebuild_verified boolean NOT NULL DEFAULT false,
  reset_validator_updated boolean NOT NULL DEFAULT false,
  backup_reference text,
  notes text,
  signed_off_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.game_world_reset_execution_signoffs_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.game_world_reset_execution_signoffs_v1 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON private.game_world_reset_execution_signoffs_v1 TO service_role;

CREATE OR REPLACE FUNCTION private.game_world_reset_execute_guard_v1(p_reset_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private'
AS $guard$
DECLARE
 v_missing_player_clubs int;
BEGIN
 SELECT COUNT(*) INTO v_missing_player_clubs
 FROM public.clubs c
 WHERE c.deleted_at IS NULL
   AND c.owner_user_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.game_world_reset_s1_competition_baseline_v1 b
     WHERE b.club_id=c.id
   );
 IF v_missing_player_clubs>0 THEN
   RAISE EXCEPTION 'World reset blocked: % player-owned clubs excluded from Season 1 baseline',
     v_missing_player_clubs;
 END IF;

 IF NOT EXISTS (
   SELECT 1 FROM private.game_world_reset_execution_signoffs_v1 s
   WHERE s.reset_run_id=p_reset_run_id
     AND s.backup_verified=true
     AND length(btrim(coalesce(s.backup_reference,'')))>5
     AND s.player_clubs_preserved=true
     AND s.national_calendar_rebuild_verified=true
     AND s.reset_validator_updated=true
     AND s.signed_off_at IS NOT NULL
 ) THEN
   RAISE EXCEPTION 'World reset blocked: verified backup, club preservation, national calendar rebuild and validation signoffs required';
 END IF;
END;
$guard$;
REVOKE ALL ON FUNCTION private.game_world_reset_execute_guard_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.game_world_reset_execute_guard_v1(uuid) TO service_role;

-- Guard the actual core too, so calling it directly cannot bypass approvals.
DO $patch$
DECLARE
 v_source text;
 v_anchor text := E'  if not exists (select 1 from public.game_state where id=true and is_paused=true)';
BEGIN
 SELECT pg_get_functiondef('public.game_world_reset_execute_core_v1(uuid,text)'::regprocedure)
 INTO v_source;
 IF v_source IS NULL THEN RAISE EXCEPTION 'Full reset core not found'; END IF;
 IF position('private.game_world_reset_execute_guard_v1(p_reset_run_id)' IN v_source)=0 THEN
   IF (length(v_source)-length(replace(v_source,v_anchor,'')))/length(v_anchor)<>1 THEN
     RAISE EXCEPTION 'Unexpected core source; refusing unsafe modification';
   END IF;
   v_source:=replace(v_source,v_anchor,
      E'  -- Fail closed if backup or player/team/calendar safeguards remain incomplete.\n  perform private.game_world_reset_execute_guard_v1(p_reset_run_id);\n\n'||v_anchor);
   EXECUTE v_source;
 END IF;
END $patch$;
