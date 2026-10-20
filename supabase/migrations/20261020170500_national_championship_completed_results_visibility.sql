-- National Championship historical results: make completed official output readable
-- even when legacy race-operations tracking has no row.
--
-- The normal race-operations publication gate is *unchanged* whenever an
-- operations row exists. For older NC / NCQ races without that row, only
-- release results once the game date has moved beyond the event date, the race
-- and its national event are marked completed, its simulation has completed
-- at least 30 real minutes earlier, and participant, stage-result, and
-- historical result records agree on both counts and rider identities.
--
-- Never synthesize or modify race results, publication timestamps, ranking
-- points, historical championship records, or replay permissions.
CREATE OR REPLACE FUNCTION public.national_championship_results_visible_v1(
  p_race_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH operations AS MATERIALIZED (
    SELECT
      ops.results_published,
      ops.replay_status,
      ops.replay_closed_at_real
    FROM public.race_operations_stage_status_v1 ops
    WHERE ops.race_id = p_race_id
    ORDER BY ops.stage_number
    LIMIT 1
  ),
  historical_national_events AS (
    SELECT
      e.id AS edition_id,
      e.final_date AS event_date,
      'final'::text AS event_type,
      NULL::uuid AS heat_id
    FROM public.national_championship_editions e
    WHERE e.final_race_id = p_race_id
      AND e.status = 'completed'
    UNION ALL
    SELECT
      h.edition_id,
      h.qualification_date,
      'qualification'::text AS event_type,
      h.id
    FROM public.national_championship_heats h
    WHERE h.race_id = p_race_id
      AND h.status = 'completed'
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM operations) THEN
      COALESCE((
        SELECT
          ops.results_published
          AND ops.replay_status IN ('ready', 'done', 'completed')
          AND ops.replay_closed_at_real IS NOT NULL
          AND clock_timestamp() >= ops.replay_closed_at_real + interval '30 minutes'
        FROM operations ops
      ), false)
    ELSE
      EXISTS (
        SELECT 1
        FROM historical_national_events ev
        JOIN public.races race ON race.id = p_race_id
        WHERE race.status = 'completed'
          AND race.category IN ('NC', 'NCQ')
          AND ev.event_date < public.get_current_game_date_date()
          AND EXISTS (
            SELECT 1
            FROM public.race_stage_simulation_runs sim
            WHERE sim.race_id = p_race_id
              AND sim.status = 'completed'
              AND sim.completed_at <= clock_timestamp() - interval '30 minutes'
          )
          AND (SELECT count(*)
               FROM public.race_stage_results sr
               WHERE sr.race_id = p_race_id) > 0
          AND (SELECT count(*)
               FROM public.race_stage_results sr
               WHERE sr.race_id = p_race_id) =
              (SELECT count(*)
               FROM public.race_participant_riders pr
               WHERE pr.race_id = p_race_id)
          AND (SELECT count(*)
               FROM public.race_stage_results sr
               WHERE sr.race_id = p_race_id) =
              (SELECT count(*)
               FROM public.national_championship_result_history history
               WHERE history.edition_id = ev.edition_id
                 AND history.race_id = p_race_id
                 AND history.event_type = ev.event_type
                 AND history.heat_id IS NOT DISTINCT FROM ev.heat_id)
          AND NOT EXISTS (
            SELECT 1
            FROM public.race_stage_results sr
            WHERE sr.race_id = p_race_id
              AND (
                sr.rider_id IS NULL
                OR NOT EXISTS (
                  SELECT 1
                  FROM public.national_championship_result_history history
                  WHERE history.edition_id = ev.edition_id
                    AND history.race_id = p_race_id
                    AND history.event_type = ev.event_type
                    AND history.heat_id IS NOT DISTINCT FROM ev.heat_id
                    AND history.rider_id = sr.rider_id
                )
              )
          )
      )
  END;
$function$;
