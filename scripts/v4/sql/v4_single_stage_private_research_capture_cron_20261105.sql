-- One narrow, self-terminating RESEARCH-ONLY capture watch.
-- No game clock writes, no worker/official result changes, no API secrets.
-- Only stage c7800ffd-f417-4feb-8a66-b928551daa4d at in-game
-- 2000-10-20 11:15 UTC. Auto-unschedules on first capture, start,
-- stage metadata change, or 2026-11-08 00:00 UTC; no general-purpose
-- race-engine V4 scheduler or permanent source access.
-- The capture function itself demands admin, repeatable read,
-- original 3-hour cutoff, unpaused clock, complete input and no
-- historical rewrite, and writes ONLY private research sidecar.
SELECT cron.schedule(
 'ppm-v4-private-capture-c7800ffd-20261105',
 '* * * * *',
 $v4_private$
 BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ WRITE;
 SELECT CASE WHEN EXISTS (
   SELECT 1 FROM public.race_stages s
   WHERE s.id='c7800ffd-f417-4feb-8a66-b928551daa4d'::uuid
     AND s.stage_date=DATE '2000-10-20'
     AND s.stage_format='road_race' AND s.terrain_type='hilly'
     AND s.planned_start_hour_number=11 AND s.planned_start_minute=15
 ) THEN private.v4_capture_research_locked_stage_source_v1(
    'c7800ffd-f417-4feb-8a66-b928551daa4d'::uuid,
    false
 ) ELSE jsonb_build_object('status','V4_RESEARCH_STAGE_IDENTITY_CHANGED',
     'research_writes',0,'official_writes',0) END AS capture_status;
 COMMIT;
 -- Only this named research job is affected.
 SELECT CASE WHEN
   EXISTS (
     SELECT 1 FROM private.v4_research_locked_full_stage_sources_v1
     WHERE stage_id='c7800ffd-f417-4feb-8a66-b928551daa4d'::uuid
   ) OR
   NOT EXISTS (
     SELECT 1 FROM public.race_stages s
     WHERE s.id='c7800ffd-f417-4feb-8a66-b928551daa4d'::uuid
       AND s.stage_date=DATE '2000-10-20'
       AND s.stage_format='road_race' AND s.terrain_type='hilly'
       AND s.planned_start_hour_number=11 AND s.planned_start_minute=15
   ) OR
   public.get_current_game_timestamp() >=
     '2000-10-20 11:15:00+00'::timestamptz OR
   now() >= '2026-11-08 00:00:00+00'::timestamptz
 THEN cron.unschedule('ppm-v4-private-capture-c7800ffd-20261105')
 ELSE false END AS watch_finished;
 $v4_private$
) AS research_watch_job_id;
