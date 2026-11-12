-- ProPeloton Manager: refuse creation of new Supabase Auth sessions
-- only during the protected migration/delay period.
-- Existing auth.sessions rows are not modified or deleted.
CREATE OR REPLACE FUNCTION public.cycling_reject_new_session_during_migration_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $guard$
DECLARE
  v_phase text;
BEGIN
  SELECT w.phase INTO v_phase
  FROM public.cycling_season_window_v1 AS w
  WHERE w.id=true;
  IF v_phase IS NULL OR v_phase IN ('migration','delayed') THEN
    RAISE EXCEPTION USING
      ERRCODE='P0001',
      MESSAGE='Sign-in is temporarily unavailable during the season migration. Please check the homepage for the reopening time.';
  END IF;
  RETURN NEW;
END
$guard$;

REVOKE ALL ON FUNCTION public.cycling_reject_new_session_during_migration_v1()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cycling_reject_new_session_during_migration_v1 ON auth.sessions;
CREATE TRIGGER cycling_reject_new_session_during_migration_v1
BEFORE INSERT ON auth.sessions
FOR EACH ROW EXECUTE FUNCTION public.cycling_reject_new_session_during_migration_v1();