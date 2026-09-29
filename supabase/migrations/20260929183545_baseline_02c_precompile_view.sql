create or replace view public.race_engine_stage_output_integrity_v1 as  WITH stage_base AS (
         SELECT s.id AS stage_id,
            s.race_id,
            NULLIF(to_jsonb(s.*) ->> 'stage_number'::text, ''::text)::integer AS stage_number,
            NULLIF(to_jsonb(s.*) ->> 'stage_date'::text, ''::text)::date AS stage_date,
            COALESCE(NULLIF(to_jsonb(s.*) ->> 'stage_format'::text, ''::text), NULLIF(to_jsonb(s.*) ->> 'format'::text, ''::text), 'unknown'::text) AS stage_format,
            COALESCE(NULLIF(to_jsonb(s.*) ->> 'status'::text, ''::text), NULLIF(to_jsonb(s.*) ->> 'stage_status'::text, ''::text), 'unknown'::text) AS stage_status
           FROM race_stages s
        ), race_base AS (
         SELECT r.id AS race_id,
            COALESCE(NULLIF(to_jsonb(r.*) ->> 'name'::text, ''::text), NULLIF(to_jsonb(r.*) ->> 'race_name'::text, ''::text), NULLIF(to_jsonb(r.*) ->> 'display_name'::text, ''::text), r.id::text) AS race_name,
            upper(COALESCE(NULLIF(to_jsonb(r.*) ->> 'category'::text, ''::text), NULLIF(to_jsonb(r.*) ->> 'race_category'::text, ''::text), NULLIF(to_jsonb(r.*) ->> 'classification'::text, ''::text), NULLIF(to_jsonb(r.*) ->> 'uci_category'::text, ''::text), 'UNKNOWN'::text)) AS race_category
           FROM races r
        ), run_counts AS (
         SELECT sr.stage_id,
            count(*)::integer AS simulation_run_rows,
            count(*) FILTER (WHERE lower(COALESCE(to_jsonb(sr.*) ->> 'status'::text, ''::text)) = 'completed'::text)::integer AS completed_simulation_run_rows,
            count(*) FILTER (WHERE lower(COALESCE(to_jsonb(sr.*) ->> 'status'::text, ''::text)) = ANY (ARRAY['running'::text, 'processing'::text]))::integer AS running_simulation_run_rows,
            max(COALESCE(NULLIF(to_jsonb(sr.*) ->> 'completed_at'::text, ''::text)::timestamp with time zone, NULLIF(to_jsonb(sr.*) ->> 'finished_at'::text, ''::text)::timestamp with time zone, NULLIF(to_jsonb(sr.*) ->> 'created_at'::text, ''::text)::timestamp with time zone, NULLIF(to_jsonb(sr.*) ->> 'started_at'::text, ''::text)::timestamp with time zone)) AS latest_run_timestamp
           FROM race_stage_simulation_runs sr
          GROUP BY sr.stage_id
        ), stage_result_counts AS (
         SELECT race_stage_results.stage_id,
            count(*)::integer AS stage_result_rows
           FROM race_stage_results
          GROUP BY race_stage_results.stage_id
        ), point_result_counts AS (
         SELECT race_stage_point_results.stage_id,
            count(*)::integer AS stage_point_result_rows
           FROM race_stage_point_results
          GROUP BY race_stage_point_results.stage_id
        ), classification_counts AS (
         SELECT COALESCE(NULLIF(to_jsonb(cs.*) ->> 'after_stage_id'::text, ''::text)::uuid, NULLIF(to_jsonb(cs.*) ->> 'stage_id'::text, ''::text)::uuid) AS stage_id,
            count(*)::integer AS classification_rows
           FROM race_classification_standings cs
          GROUP BY (COALESCE(NULLIF(to_jsonb(cs.*) ->> 'after_stage_id'::text, ''::text)::uuid, NULLIF(to_jsonb(cs.*) ->> 'stage_id'::text, ''::text)::uuid))
        ), ranking_counts AS (
         SELECT COALESCE(NULLIF(to_jsonb(ra.*) ->> 'after_stage_id'::text, ''::text)::uuid, NULLIF(to_jsonb(ra.*) ->> 'stage_id'::text, ''::text)::uuid) AS stage_id,
            count(*)::integer AS ranking_award_rows
           FROM race_ranking_point_awards ra
          GROUP BY (COALESCE(NULLIF(to_jsonb(ra.*) ->> 'after_stage_id'::text, ''::text)::uuid, NULLIF(to_jsonb(ra.*) ->> 'stage_id'::text, ''::text)::uuid))
        ), prize_counts AS (
         SELECT COALESCE(NULLIF(to_jsonb(pa.*) ->> 'after_stage_id'::text, ''::text)::uuid, NULLIF(to_jsonb(pa.*) ->> 'stage_id'::text, ''::text)::uuid) AS stage_id,
            count(*)::integer AS prize_award_rows
           FROM race_prize_awards pa
          GROUP BY (COALESCE(NULLIF(to_jsonb(pa.*) ->> 'after_stage_id'::text, ''::text)::uuid, NULLIF(to_jsonb(pa.*) ->> 'stage_id'::text, ''::text)::uuid))
        ), report_counts AS (
         SELECT race_stage_report_events.stage_id,
            count(*)::integer AS report_event_rows
           FROM race_stage_report_events
          GROUP BY race_stage_report_events.stage_id
        ), replay_counts AS (
         SELECT race_stage_replay_frames.stage_id,
            count(*)::integer AS replay_frame_rows,
            count(DISTINCT race_stage_replay_frames.simulation_run_id)::integer AS replay_simulation_run_rows
           FROM race_stage_replay_frames
          GROUP BY race_stage_replay_frames.stage_id
        ), rider_state_counts AS (
         SELECT race_stage_rider_states.stage_id,
            count(*)::integer AS rider_state_rows
           FROM race_stage_rider_states
          GROUP BY race_stage_rider_states.stage_id
        ), team_state_counts AS (
         SELECT race_stage_team_states.stage_id,
            count(*)::integer AS team_state_rows
           FROM race_stage_team_states
          GROUP BY race_stage_team_states.stage_id
        ), joined AS (
         SELECT sb.race_id,
            rb.race_name,
            rb.race_category,
            sb.stage_id,
            sb.stage_number,
            sb.stage_date,
            sb.stage_format,
            sb.stage_status,
            COALESCE(rc.simulation_run_rows, 0) AS simulation_run_rows,
            COALESCE(rc.completed_simulation_run_rows, 0) AS completed_simulation_run_rows,
            COALESCE(rc.running_simulation_run_rows, 0) AS running_simulation_run_rows,
            rc.latest_run_timestamp,
            COALESCE(src.stage_result_rows, 0) AS stage_result_rows,
            COALESCE(prc.stage_point_result_rows, 0) AS stage_point_result_rows,
            COALESCE(cc.classification_rows, 0) AS classification_rows,
            COALESCE(rac.ranking_award_rows, 0) AS ranking_award_rows,
            COALESCE(pac.prize_award_rows, 0) AS prize_award_rows,
            COALESCE(rec.report_event_rows, 0) AS report_event_rows,
            COALESCE(rfc.replay_frame_rows, 0) AS replay_frame_rows,
            COALESCE(rfc.replay_simulation_run_rows, 0) AS replay_simulation_run_rows,
            COALESCE(rsc.rider_state_rows, 0) AS rider_state_rows,
            COALESCE(tsc.team_state_rows, 0) AS team_state_rows
           FROM stage_base sb
             LEFT JOIN race_base rb ON rb.race_id = sb.race_id
             LEFT JOIN run_counts rc ON rc.stage_id = sb.stage_id
             LEFT JOIN stage_result_counts src ON src.stage_id = sb.stage_id
             LEFT JOIN point_result_counts prc ON prc.stage_id = sb.stage_id
             LEFT JOIN classification_counts cc ON cc.stage_id = sb.stage_id
             LEFT JOIN ranking_counts rac ON rac.stage_id = sb.stage_id
             LEFT JOIN prize_counts pac ON pac.stage_id = sb.stage_id
             LEFT JOIN report_counts rec ON rec.stage_id = sb.stage_id
             LEFT JOIN replay_counts rfc ON rfc.stage_id = sb.stage_id
             LEFT JOIN rider_state_counts rsc ON rsc.stage_id = sb.stage_id
             LEFT JOIN team_state_counts tsc ON tsc.stage_id = sb.stage_id
        )
 SELECT race_id,
    race_name,
    race_category,
    stage_id,
    stage_number,
    stage_date,
    stage_format,
    stage_status,
    simulation_run_rows,
    completed_simulation_run_rows,
    running_simulation_run_rows,
    latest_run_timestamp,
    stage_result_rows,
    stage_point_result_rows,
    classification_rows,
    ranking_award_rows,
    prize_award_rows,
    report_event_rows,
    replay_frame_rows,
    replay_simulation_run_rows,
    rider_state_rows,
    team_state_rows,
    completed_simulation_run_rows > 0 AS has_completed_run,
    stage_result_rows > 0 OR stage_point_result_rows > 0 OR classification_rows > 0 OR ranking_award_rows > 0 OR prize_award_rows > 0 AS has_official_outputs,
    report_event_rows > 0 AS has_report_events,
    replay_frame_rows > 0 AS has_replay_frames,
    rider_state_rows > 0 OR team_state_rows > 0 AS has_engine_state_rows,
    simulation_run_rows > 0 OR stage_result_rows > 0 OR stage_point_result_rows > 0 OR classification_rows > 0 OR ranking_award_rows > 0 OR prize_award_rows > 0 OR replay_frame_rows > 0 OR rider_state_rows > 0 OR team_state_rows > 0 AS should_block_normal_simulation,
        CASE
            WHEN completed_simulation_run_rows > 1 THEN 'duplicate_completed_runs_review'::text
            WHEN running_simulation_run_rows > 0 AND completed_simulation_run_rows > 0 THEN 'running_and_completed_runs_review'::text
            WHEN completed_simulation_run_rows = 0 AND (stage_result_rows > 0 OR stage_point_result_rows > 0 OR classification_rows > 0 OR ranking_award_rows > 0 OR prize_award_rows > 0) THEN 'official_outputs_without_completed_run_review'::text
            WHEN completed_simulation_run_rows = 0 AND (replay_frame_rows > 0 OR rider_state_rows > 0 OR team_state_rows > 0) THEN 'engine_state_without_completed_run_review'::text
            WHEN completed_simulation_run_rows > 0 AND stage_result_rows = 0 THEN 'completed_run_missing_stage_results_review'::text
            WHEN completed_simulation_run_rows > 0 AND report_event_rows = 0 THEN 'completed_run_missing_report_events_review'::text
            WHEN completed_simulation_run_rows > 0 THEN 'completed_outputs_present'::text
            WHEN simulation_run_rows > 0 THEN 'simulation_exists_not_completed_review'::text
            WHEN report_event_rows > 0 THEN 'not_simulated_with_static_report_events'::text
            ELSE 'not_simulated'::text
        END AS output_integrity_status
   FROM joined j;;