create or replace view public.ai_competition_filler_club_pool_v1 as  SELECT id,
    name,
    country_code,
    logo_path,
    club_type,
    is_ai,
    updated_at,
    is_active,
    club_tier,
    tier2_division,
    tier3_division,
    amateur_division,
    world_tier,
    reputation,
    season_points
   FROM clubs c
  WHERE is_ai = true AND club_type = 'main'::text AND deleted_at IS NULL AND COALESCE(is_active, true) = true AND NULLIF(btrim(logo_path), ''::text) IS NOT NULL AND name !~~* 'AI Team%'::text AND name !~~* 'AI WorldTeam%'::text AND name !~~* 'AI ProTeam%'::text AND name !~~* 'AI Continental%'::text AND name !~~* 'AI Amateur%'::text AND name !~~* 'AI %'::text;;

create or replace view public.club_roster as  SELECT cr.club_id,
    r.id AS rider_id,
    r.display_name,
    cr.assigned_role,
    get_age_years_on_game_date(r.birth_date) AS age_years,
    r.overall,
    r.country_code,
    r.availability_status,
    r.fatigue
   FROM club_riders cr
     JOIN riders r ON r.id = cr.rider_id;;

create or replace view public.international_points_awards_ledger_v1 as  SELECT a.race_id,
    r.name AS race_name,
    r.category AS race_category,
    r.status AS race_status,
    a.stage_id,
    s.stage_number,
    s.stage_format,
    s.stage_date,
    EXTRACT(year FROM COALESCE(r.start_date, s.stage_date))::integer AS season_year,
    a.source_type,
    a.classification_type,
    a.rank,
    a.rider_id,
    a.team_id,
    a.display_name_snapshot AS rider_name_snapshot,
    club_current_display_name_v1(a.team_id, a.team_name_snapshot) AS team_name_snapshot,
    COALESCE(a.rider_points, 0)::numeric AS rider_points,
    COALESCE(a.team_points, 0)::numeric AS team_points,
    a.metadata
   FROM race_ranking_point_awards a
     LEFT JOIN races r ON r.id = a.race_id
     LEFT JOIN race_stages s ON s.id = a.stage_id;;

create or replace view public.race_engine_replay_storage_by_stage_v1 as  WITH replay_by_stage AS (
         SELECT rf.stage_id,
            count(*)::integer AS replay_frame_rows,
            count(DISTINCT rf.simulation_run_id)::integer AS simulation_run_count,
            min(rf.frame_number) AS first_frame_number,
            max(rf.frame_number) AS last_frame_number,
            min(rf.km_marker) AS first_km_marker,
            max(rf.km_marker) AS last_km_marker,
            sum(pg_column_size(rf.*)) AS estimated_replay_row_bytes,
            avg(pg_column_size(rf.*))::numeric(18,2) AS avg_replay_row_bytes,
            sum(COALESCE(pg_column_size(rf.metadata), 0)) AS estimated_metadata_bytes
           FROM race_stage_replay_frames rf
          GROUP BY rf.stage_id
        ), run_by_stage AS (
         SELECT sr.stage_id,
            count(*)::integer AS run_rows,
            count(*) FILTER (WHERE lower(COALESCE(to_jsonb(sr.*) ->> 'status'::text, ''::text)) = 'completed'::text)::integer AS completed_run_rows,
            max(COALESCE(NULLIF(to_jsonb(sr.*) ->> 'completed_at'::text, ''::text)::timestamp with time zone, NULLIF(to_jsonb(sr.*) ->> 'finished_at'::text, ''::text)::timestamp with time zone, NULLIF(to_jsonb(sr.*) ->> 'created_at'::text, ''::text)::timestamp with time zone, NULLIF(to_jsonb(sr.*) ->> 'started_at'::text, ''::text)::timestamp with time zone)) AS latest_run_timestamp
           FROM race_stage_simulation_runs sr
          GROUP BY sr.stage_id
        ), stage_base AS (
         SELECT s.id AS stage_id,
            s.race_id,
            NULLIF(to_jsonb(s.*) ->> 'stage_number'::text, ''::text)::integer AS stage_number,
            NULLIF(to_jsonb(s.*) ->> 'stage_date'::text, ''::text)::date AS stage_date,
            COALESCE(NULLIF(to_jsonb(s.*) ->> 'stage_format'::text, ''::text), NULLIF(to_jsonb(s.*) ->> 'format'::text, ''::text), 'unknown'::text) AS stage_format,
            NULLIF(to_jsonb(s.*) ->> 'distance_km'::text, ''::text)::numeric AS distance_km
           FROM race_stages s
        ), race_base AS (
         SELECT r.id AS race_id,
            COALESCE(NULLIF(to_jsonb(r.*) ->> 'name'::text, ''::text), NULLIF(to_jsonb(r.*) ->> 'race_name'::text, ''::text), NULLIF(to_jsonb(r.*) ->> 'display_name'::text, ''::text), r.id::text) AS race_name,
            upper(COALESCE(NULLIF(to_jsonb(r.*) ->> 'category'::text, ''::text), NULLIF(to_jsonb(r.*) ->> 'race_category'::text, ''::text), NULLIF(to_jsonb(r.*) ->> 'classification'::text, ''::text), NULLIF(to_jsonb(r.*) ->> 'uci_category'::text, ''::text), 'UNKNOWN'::text)) AS race_category
           FROM races r
        )
 SELECT rb.race_id,
    rb.race_name,
    rb.race_category,
    sb.stage_id,
    sb.stage_number,
    sb.stage_date,
    sb.stage_format,
    sb.distance_km,
    rbs.replay_frame_rows,
    rbs.simulation_run_count,
    rbs.first_frame_number,
    rbs.last_frame_number,
    rbs.first_km_marker,
    rbs.last_km_marker,
    rbs.estimated_replay_row_bytes,
    pg_size_pretty(rbs.estimated_replay_row_bytes) AS estimated_replay_row_size,
    rbs.avg_replay_row_bytes,
    rbs.estimated_metadata_bytes,
    pg_size_pretty(rbs.estimated_metadata_bytes) AS estimated_metadata_size,
    runs.run_rows,
    runs.completed_run_rows,
    runs.latest_run_timestamp,
        CASE
            WHEN runs.latest_run_timestamp IS NULL THEN NULL::integer
            ELSE floor(EXTRACT(epoch FROM now() - runs.latest_run_timestamp) / 86400::numeric)::integer
        END AS real_days_since_latest_run,
    COALESCE(rule.retention_days, 60) AS retention_days,
    COALESCE(rule.retention_tier, 'unknown_or_review'::text) AS retention_tier,
    COALESCE(rule.keep_policy, 'manual_review_before_delete'::text) AS keep_policy,
        CASE
            WHEN runs.latest_run_timestamp IS NULL THEN 'review_no_run_timestamp'::text
            WHEN COALESCE(rule.keep_policy, 'manual_review_before_delete'::text) = ANY (ARRAY['keep_season_or_archive_compressed'::text, 'review_before_delete'::text, 'manual_review_before_delete'::text]) THEN 'manual_review'::text
            WHEN floor(EXTRACT(epoch FROM now() - runs.latest_run_timestamp) / 86400::numeric)::integer >= COALESCE(rule.retention_days, 60) THEN 'retention_candidate'::text
            ELSE 'keep_for_now'::text
        END AS retention_status
   FROM replay_by_stage rbs
     LEFT JOIN stage_base sb ON sb.stage_id = rbs.stage_id
     LEFT JOIN race_base rb ON rb.race_id = sb.race_id
     LEFT JOIN run_by_stage runs ON runs.stage_id = rbs.stage_id
     LEFT JOIN race_stage_replay_retention_rules_v1 rule ON upper(rule.race_category) = rb.race_category;;

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

create or replace view public.race_participant_riders_v1 as  SELECT rpr.id,
    rpr.race_id,
    rpr.team_id,
    rpr.team_id AS club_id,
    rpr.rider_id,
    rpr.rider_name_snapshot,
    club_current_display_name_v1(rpr.team_id, rpr.team_name_snapshot) AS team_name_snapshot,
    rpr.country_code_snapshot,
    rpr.age_snapshot,
    rpr.is_young_rider,
    rpr.start_number,
    COALESCE(rpr.role_snapshot, cr.assigned_role::text) AS role_snapshot,
    COALESCE(rpr.overall_snapshot, cr.overall::integer) AS overall_snapshot,
    COALESCE(rpr.can_view_exact_overall, false) AS can_view_exact_overall,
    COALESCE(rpr.overall_range_label, rider_overall_range_label_v1(COALESCE(rpr.overall_snapshot, cr.overall::integer))) AS overall_range_label,
    rpr.created_at
   FROM race_participant_riders rpr
     LEFT JOIN club_roster cr ON cr.club_id = rpr.team_id AND cr.rider_id = rpr.rider_id;;

create or replace view public.rider_commitment_windows as  SELECT tcp.rider_id,
    b.id AS source_id,
    'training_camp'::text AS source_type,
    b.club_id,
    b.start_date - 1 AS blocked_from,
    b.end_date + 1 AS blocked_until,
    b.start_date,
    b.end_date,
    b.status
   FROM training_camp_bookings b
     JOIN training_camp_participants tcp ON tcp.booking_id = b.id
  WHERE b.status = ANY (ARRAY['planned'::text, 'active'::text])
UNION ALL
 SELECT sm.rider_id,
    d.id AS source_id,
    'national_team_duty'::text AS source_type,
    sm.club_id_snapshot AS club_id,
    d.start_date AS blocked_from,
    d.end_date AS blocked_until,
    d.start_date,
    d.end_date,
    d.status
   FROM national_team_duties d
     JOIN national_team_squad_members sm ON sm.squad_id = d.squad_id
  WHERE d.status = ANY (ARRAY['planned'::text, 'active'::text]);;

create or replace view public.rider_international_points_by_season_v1 as  WITH totals AS (
         SELECT international_points_awards_ledger_v1.season_year,
            international_points_awards_ledger_v1.rider_id,
            max(international_points_awards_ledger_v1.rider_name_snapshot) AS rider_name_snapshot,
            max(international_points_awards_ledger_v1.team_name_snapshot) AS latest_team_name_snapshot,
            sum(international_points_awards_ledger_v1.rider_points) AS international_points,
            sum(international_points_awards_ledger_v1.rider_points) FILTER (WHERE international_points_awards_ledger_v1.source_type = 'oneday_finish'::text) AS oneday_finish_points,
            sum(international_points_awards_ledger_v1.rider_points) FILTER (WHERE international_points_awards_ledger_v1.source_type = 'stage_finish'::text) AS stage_finish_points,
            sum(international_points_awards_ledger_v1.rider_points) FILTER (WHERE international_points_awards_ledger_v1.source_type = 'leader_day'::text) AS leader_day_points,
            sum(international_points_awards_ledger_v1.rider_points) FILTER (WHERE international_points_awards_ledger_v1.source_type = 'final_gc'::text) AS final_gc_points,
            count(*) AS scoring_rows,
            count(DISTINCT international_points_awards_ledger_v1.race_id) AS scoring_races,
            count(DISTINCT international_points_awards_ledger_v1.stage_id) AS scoring_stages
           FROM international_points_awards_ledger_v1
          WHERE international_points_awards_ledger_v1.rider_id IS NOT NULL AND international_points_awards_ledger_v1.season_year IS NOT NULL
          GROUP BY international_points_awards_ledger_v1.season_year, international_points_awards_ledger_v1.rider_id
        )
 SELECT rank() OVER (PARTITION BY season_year ORDER BY totals.international_points DESC, rider_name_snapshot, rider_id) AS international_rank,
    season_year,
    rider_id,
    rider_name_snapshot,
    latest_team_name_snapshot,
    COALESCE(international_points, 0::numeric) AS international_points,
    COALESCE(oneday_finish_points, 0::numeric) AS oneday_finish_points,
    COALESCE(stage_finish_points, 0::numeric) AS stage_finish_points,
    COALESCE(leader_day_points, 0::numeric) AS leader_day_points,
    COALESCE(final_gc_points, 0::numeric) AS final_gc_points,
    scoring_rows,
    scoring_races,
    scoring_stages
   FROM totals;;

create or replace view public.rider_last_weekly_development_v as  WITH latest AS (
         SELECT rider_weekly_development_summary.rider_id,
            max(rider_weekly_development_summary.week_end_date) AS week_end_date
           FROM rider_weekly_development_summary
          GROUP BY rider_weekly_development_summary.rider_id
        )
 SELECT s.rider_id,
    s.week_start_date,
    s.week_end_date,
    s.regular_training_days,
    s.training_camp_days,
    s.race_days,
    s.meaningful_days,
    s.had_inactivity_decay,
    s.processed_at,
    COALESCE(jsonb_agg(jsonb_build_object('attribute_code', c.attribute_code, 'old_value', c.old_value, 'new_value', c.new_value, 'delta_value', c.delta_value) ORDER BY c.attribute_code) FILTER (WHERE c.attribute_code IS NOT NULL), '[]'::jsonb) AS skill_changes
   FROM latest l
     JOIN rider_weekly_development_summary s ON s.rider_id = l.rider_id AND s.week_end_date = l.week_end_date
     LEFT JOIN rider_weekly_skill_changes c ON c.rider_id = s.rider_id AND c.week_end_date = s.week_end_date
  GROUP BY s.rider_id, s.week_start_date, s.week_end_date, s.regular_training_days, s.training_camp_days, s.race_days, s.meaningful_days, s.had_inactivity_decay, s.processed_at;;

create or replace view public.rider_statistics_view as  SELECT r.id AS rider_id,
    cr.club_id,
    club_current_display_name_v1(c.id, c.name) AS club_name,
    c.country_code AS club_country_code,
    c.club_tier,
    c.tier2_division,
    c.tier3_division,
    c.amateur_division,
    c.is_ai AS club_is_ai,
    c.is_active AS club_is_active,
    r.country_code AS rider_country_code,
    r.first_name,
    r.last_name,
    r.display_name,
    r.role,
    get_age_years_on_game_date(r.birth_date) AS age_years,
    r.overall,
    r.potential,
    r.sprint,
    r.climbing,
    r.time_trial,
    r.endurance,
    r.flat,
    r.recovery,
    r.resistance,
    r.race_iq,
    r.teamwork,
    r.morale,
    r.market_value,
    r.salary,
    r.contract_expires_season,
    r.contract_expires_at,
    r.availability_status,
    r.fatigue,
    r.image_url,
    r.created_at
   FROM riders r
     JOIN club_riders cr ON cr.rider_id = r.id
     JOIN clubs c ON c.id = cr.club_id
  WHERE c.deleted_at IS NULL;;

create or replace view public.team_international_points_by_season_v1 as  WITH current_season AS MATERIALIZED (
         SELECT team_ranking_get_current_season_year_v1() AS season_year
        ), totals AS MATERIALIZED (
         SELECT l.season_year,
            l.team_id,
            max(l.team_name_snapshot) AS team_name_snapshot,
            sum(l.team_points) AS international_points,
            sum(l.team_points) FILTER (WHERE l.source_type = 'oneday_finish'::text) AS oneday_finish_points,
            sum(l.team_points) FILTER (WHERE l.source_type = 'stage_finish'::text) AS stage_finish_points,
            sum(l.team_points) FILTER (WHERE l.source_type = 'leader_day'::text) AS leader_day_points,
            sum(l.team_points) FILTER (WHERE l.source_type = 'final_gc'::text) AS final_gc_points,
            count(*) AS scoring_rows,
            count(DISTINCT l.race_id) AS scoring_races,
            count(DISTINCT l.stage_id) AS scoring_stages
           FROM international_points_awards_ledger_v1 l
          WHERE l.team_id IS NOT NULL AND l.season_year IS NOT NULL
          GROUP BY l.season_year, l.team_id
        ), current_teams AS MATERIALIZED (
         SELECT c.id AS team_id,
            c.name AS team_name_snapshot
           FROM clubs c
          WHERE c.deleted_at IS NULL AND COALESCE(c.club_type, 'main'::text) <> 'developing'::text AND (c.club_tier::text = ANY (ARRAY['worldteam'::text, 'proteam'::text, 'continental'::text, 'amateur'::text]))
        ), combined AS (
         SELECT t.season_year,
            t.team_id,
            t.team_name_snapshot,
            COALESCE(t.international_points, 0::numeric) AS international_points,
            COALESCE(t.oneday_finish_points, 0::numeric) AS oneday_finish_points,
            COALESCE(t.stage_finish_points, 0::numeric) AS stage_finish_points,
            COALESCE(t.leader_day_points, 0::numeric) AS leader_day_points,
            COALESCE(t.final_gc_points, 0::numeric) AS final_gc_points,
            t.scoring_rows,
            t.scoring_races,
            t.scoring_stages
           FROM totals t
        UNION ALL
         SELECT cs.season_year,
            ct.team_id,
            ct.team_name_snapshot,
            0::numeric AS international_points,
            0::numeric AS oneday_finish_points,
            0::numeric AS stage_finish_points,
            0::numeric AS leader_day_points,
            0::numeric AS final_gc_points,
            0::bigint AS scoring_rows,
            0::bigint AS scoring_races,
            0::bigint AS scoring_stages
           FROM current_season cs
             CROSS JOIN current_teams ct
             LEFT JOIN totals t ON t.season_year = cs.season_year AND t.team_id = ct.team_id
          WHERE t.team_id IS NULL
        )
 SELECT rank() OVER (PARTITION BY season_year ORDER BY international_points DESC, team_name_snapshot, team_id) AS international_rank,
    season_year,
    team_id,
    team_name_snapshot,
    international_points,
    oneday_finish_points,
    stage_finish_points,
    leader_day_points,
    final_gc_points,
    scoring_rows,
    scoring_races,
    scoring_stages
   FROM combined;;

create or replace view public.team_ranking_tiebreakers_by_season_v1 as  WITH seasons AS (
         SELECT team_ranking_get_current_season_year_v1() AS season_year
        ), ranking_clubs AS (
         SELECT c.id AS team_id,
            c.name AS team_name,
            c.club_tier::text AS club_tier,
            c.tier2_division,
            c.tier3_division,
            c.amateur_division
           FROM clubs c
          WHERE COALESCE(c.deleted_at, NULL::timestamp with time zone) IS NULL AND COALESCE(c.club_type, 'main'::text) <> 'developing'::text AND (c.club_tier::text = ANY (ARRAY['worldteam'::text, 'proteam'::text, 'continental'::text, 'amateur'::text]))
        )
 SELECT s.season_year,
    rc.team_id,
    rc.team_name,
    rc.club_tier,
    rc.tier2_division,
    rc.tier3_division,
    rc.amateur_division,
    team_ranking_get_team_international_points_v1(rc.team_id, s.season_year) AS international_points,
    team_ranking_get_completed_race_count_v1(rc.team_id, s.season_year) AS completed_race_count,
    team_ranking_get_race_reputation_value_v1(rc.team_id) AS race_reputation_value
   FROM seasons s
     CROSS JOIN ranking_clubs rc;;

create or replace view public.team_rankings_view as  SELECT id,
    name,
    country_code,
    club_tier,
    tier2_division,
    tier3_division,
    amateur_division,
    season_points,
    created_at,
    logo_path,
    is_ai,
    is_active
   FROM clubs c
  WHERE deleted_at IS NULL;;

create or replace view public.rider_stage_podiums_by_season_v1 as  SELECT EXTRACT(year FROM rr.start_date)::integer AS season_year,
    sr.rider_id,
    count(*) FILTER (WHERE sr.rank = 1 AND (sr.status IS NULL OR (lower(sr.status) <> ALL (ARRAY['dnf'::text, 'dns'::text, 'dsq'::text, 'otl'::text, 'abandoned'::text, 'did_not_finish'::text, 'did_not_start'::text, 'disqualified'::text]))))::integer AS stage_wins_from_results,
    count(*) FILTER (WHERE sr.rank >= 1 AND sr.rank <= 3 AND (sr.status IS NULL OR (lower(sr.status) <> ALL (ARRAY['dnf'::text, 'dns'::text, 'dsq'::text, 'otl'::text, 'abandoned'::text, 'did_not_finish'::text, 'did_not_start'::text, 'disqualified'::text]))))::integer AS stage_podiums,
    count(DISTINCT sr.race_id) FILTER (WHERE sr.rank >= 1 AND sr.rank <= 3 AND (sr.status IS NULL OR (lower(sr.status) <> ALL (ARRAY['dnf'::text, 'dns'::text, 'dsq'::text, 'otl'::text, 'abandoned'::text, 'did_not_finish'::text, 'did_not_start'::text, 'disqualified'::text]))))::integer AS races_with_stage_podiums
   FROM race_stage_results sr
     LEFT JOIN races rr ON rr.id = sr.race_id
  WHERE sr.rider_id IS NOT NULL
  GROUP BY (EXTRACT(year FROM rr.start_date)::integer), sr.rider_id;;

create or replace view public.rider_season_achievements_ledger_v1 as  WITH final_stage_per_race AS (
         SELECT DISTINCT ON (s.race_id) s.race_id,
            s.id AS final_stage_id,
            s.stage_number AS final_stage_number,
            s.stage_date AS final_stage_date
           FROM race_stages s
          ORDER BY s.race_id, s.stage_number DESC NULLS LAST, s.stage_date DESC NULLS LAST, s.id
        ), stage_wins AS (
         SELECT EXTRACT(year FROM COALESCE(r.start_date, s.stage_date))::integer AS season_year,
            r.id AS race_id,
            r.name AS race_name,
            r.category AS race_category,
            s.id AS stage_id,
            s.stage_number,
            s.stage_date,
            sr.rider_id,
            sr.team_id,
            'stage_win'::text AS achievement_type,
            NULL::text AS classification_type,
            1 AS achievement_count
           FROM race_stage_results sr
             JOIN race_stages s ON s.id = sr.stage_id
             JOIN races r ON r.id = s.race_id
          WHERE sr.rank = 1 AND sr.rider_id IS NOT NULL
        ), final_jerseys AS (
         SELECT DISTINCT EXTRACT(year FROM COALESCE(r.start_date, fs.final_stage_date))::integer AS season_year,
            r.id AS race_id,
            r.name AS race_name,
            r.category AS race_category,
            fs.final_stage_id AS stage_id,
            fs.final_stage_number AS stage_number,
            fs.final_stage_date AS stage_date,
            cs.rider_id,
            cs.team_id,
            'final_jersey'::text AS achievement_type,
            lower(cs.classification_type) AS classification_type,
            1 AS achievement_count
           FROM race_classification_standings cs
             JOIN races r ON r.id = cs.race_id
             LEFT JOIN final_stage_per_race fs ON fs.race_id = cs.race_id
          WHERE cs.rank = 1 AND cs.rider_id IS NOT NULL AND r.category ~~ '2.%'::text AND (r.status = ANY (ARRAY['completed'::text, 'archived'::text, 'finished'::text, 'race_finished'::text])) AND COALESCE(cs.entity_type, 'rider'::text) = 'rider'::text AND (lower(cs.classification_type) = ANY (ARRAY['general'::text, 'gc'::text, 'overall'::text, 'points'::text, 'sprint'::text, 'sprints'::text, 'mountain'::text, 'mountains'::text, 'kom'::text, 'climber'::text, 'young'::text, 'young_rider'::text, 'best_young'::text]))
        )
 SELECT stage_wins.season_year,
    stage_wins.race_id,
    stage_wins.race_name,
    stage_wins.race_category,
    stage_wins.stage_id,
    stage_wins.stage_number,
    stage_wins.stage_date,
    stage_wins.rider_id,
    stage_wins.team_id,
    stage_wins.achievement_type,
    stage_wins.classification_type,
    stage_wins.achievement_count
   FROM stage_wins
UNION ALL
 SELECT final_jerseys.season_year,
    final_jerseys.race_id,
    final_jerseys.race_name,
    final_jerseys.race_category,
    final_jerseys.stage_id,
    final_jerseys.stage_number,
    final_jerseys.stage_date,
    final_jerseys.rider_id,
    final_jerseys.team_id,
    final_jerseys.achievement_type,
    final_jerseys.classification_type,
    final_jerseys.achievement_count
   FROM final_jerseys;;

create or replace view public.club_profile_popup_view as  WITH rider_counts AS (
         SELECT cr.club_id,
            count(DISTINCT cr.rider_id)::integer AS rider_count
           FROM club_riders cr
          GROUP BY cr.club_id
        ), sponsor_stats AS (
         SELECT cs.club_id,
            count(*) FILTER (WHERE cs.status = 'active'::text)::integer AS active_sponsor_count,
            COALESCE(sum(cs.monthly_amount) FILTER (WHERE cs.status = 'active'::text), 0::numeric)::bigint AS active_sponsor_monthly_total
           FROM club_sponsors cs
          GROUP BY cs.club_id
        ), ranked_clubs AS (
         SELECT trv.id AS club_id,
            rank() OVER (ORDER BY trv.season_points DESC, trv.created_at, trv.id)::integer AS world_rank
           FROM team_rankings_view trv
          WHERE COALESCE(trv.is_active, true) = true
        )
 SELECT c.id AS club_id,
    club_current_display_name_v1(c.id, c.name) AS club_name,
    c.country_code,
    co.name AS country_name,
    c.is_ai,
        CASE
            WHEN c.is_ai THEN 'ai'::text
            ELSE 'user'::text
        END AS club_type,
    c.owner_user_id,
    COALESCE(NULLIF(TRIM(BOTH FROM concat_ws(' '::text, p.first_name, p.last_name)), ''::text), p.username) AS owner_display_name,
    p.username AS owner_username,
    c.logo_path,
    c.motto,
    c.crest_style,
    c.primary_color,
    c.secondary_color,
    c.club_tier,
    c.world_tier,
    c.reputation,
    c.season_points,
    rc.world_rank,
    c.tier2_division,
    c.tier3_division,
    c.amateur_division,
    c.cash_balance AS club_cash_balance,
    COALESCE(fin.current_balance, c.cash_balance) AS current_balance,
    fin.weekly_income,
    fin.weekly_expenses,
    fin.wage_total,
    COALESCE(riders.rider_count, 0) AS rider_count,
    COALESCE(sp.active_sponsor_count, 0) AS active_sponsor_count,
    COALESCE(sp.active_sponsor_monthly_total, 0::bigint) AS active_sponsor_monthly_total,
    ms.main_sponsor_name,
    ms.main_sponsor_monthly_amount,
    infra.hq_level,
    infra.training_center_level,
    infra.medical_center_level,
    infra.scouting_level,
    infra.equipment_level,
    settings.default_training_intensity,
    settings.ui_theme_variant,
    kit.kit_id,
    kit.kit_name,
    kit.kit_config,
    c.is_active,
    c.created_at,
    c.updated_at,
    ms.main_sponsor_logo_url
   FROM clubs c
     LEFT JOIN countries co ON co.code = c.country_code
     LEFT JOIN profiles p ON p.id = c.owner_user_id
     LEFT JOIN rider_counts riders ON riders.club_id = c.id
     LEFT JOIN sponsor_stats sp ON sp.club_id = c.id
     LEFT JOIN ranked_clubs rc ON rc.club_id = c.id
     LEFT JOIN LATERAL ( SELECT cfs.current_balance,
            cfs.weekly_income,
            cfs.weekly_expenses,
            cfs.wage_total
           FROM club_finance_summary cfs
          WHERE cfs.club_id = c.id
          ORDER BY cfs.updated_at DESC, cfs.created_at DESC
         LIMIT 1) fin ON true
     LEFT JOIN LATERAL ( SELECT ci.hq_level,
            ci.training_center_level,
            ci.medical_center_level,
            ci.scouting_level,
            ci.equipment_level
           FROM club_infrastructure ci
          WHERE ci.club_id = c.id
          ORDER BY ci.updated_at DESC, ci.created_at DESC
         LIMIT 1) infra ON true
     LEFT JOIN LATERAL ( SELECT cs.default_training_intensity,
            cs.ui_theme_variant
           FROM club_settings cs
          WHERE cs.club_id = c.id
          ORDER BY cs.updated_at DESC, cs.created_at DESC
         LIMIT 1) settings ON true
     LEFT JOIN LATERAL ( SELECT tk.id AS kit_id,
            tk.name AS kit_name,
            tk.config AS kit_config
           FROM team_kits tk
          WHERE tk.team_id = c.id
          ORDER BY (
                CASE
                    WHEN tk.name = 'default'::text THEN 0
                    ELSE 1
                END), tk.updated_at DESC
         LIMIT 1) kit ON true
     LEFT JOIN LATERAL ( SELECT cs.name AS main_sponsor_name,
            cs.monthly_amount AS main_sponsor_monthly_amount,
            COALESCE(cs.logo_url, sc.logo_url) AS main_sponsor_logo_url
           FROM club_sponsors cs
             LEFT JOIN sponsor_companies sc ON sc.id = cs.company_id
          WHERE cs.club_id = c.id AND cs.status = 'active'::text
          ORDER BY cs.is_main DESC, cs.monthly_amount DESC, cs.created_at DESC
         LIMIT 1) ms ON true
  WHERE c.deleted_at IS NULL;;

create or replace view public.rider_season_achievements_by_season_v1 as  SELECT season_year,
    rider_id,
    count(*) FILTER (WHERE achievement_type = 'stage_win'::text)::integer AS stage_wins,
    count(*) FILTER (WHERE achievement_type = 'final_jersey'::text)::integer AS final_jerseys,
    count(DISTINCT race_id) FILTER (WHERE achievement_type = 'stage_win'::text)::integer AS races_with_stage_wins,
    count(DISTINCT race_id) FILTER (WHERE achievement_type = 'final_jersey'::text)::integer AS races_with_final_jerseys
   FROM rider_season_achievements_ledger_v1
  WHERE rider_id IS NOT NULL AND season_year IS NOT NULL
  GROUP BY season_year, rider_id;;

create or replace view public.rider_season_overview_v1 as  WITH rider_seasons AS (
         SELECT rider_international_points_by_season_v1.season_year,
            rider_international_points_by_season_v1.rider_id
           FROM rider_international_points_by_season_v1
        UNION
         SELECT rider_season_achievements_by_season_v1.season_year,
            rider_season_achievements_by_season_v1.rider_id
           FROM rider_season_achievements_by_season_v1
        UNION
         SELECT rider_stage_podiums_by_season_v1.season_year,
            rider_stage_podiums_by_season_v1.rider_id
           FROM rider_stage_podiums_by_season_v1
        )
 SELECT rs.season_year,
    rs.rider_id,
    COALESCE(p.international_points, 0::numeric) AS points,
    COALESCE(pd.stage_podiums, 0) AS podiums,
    COALESCE(a.final_jerseys, 0) AS jerseys,
    COALESCE(a.stage_wins, COALESCE(pd.stage_wins_from_results, 0), 0) AS stage_wins,
    COALESCE(a.final_jerseys, 0) AS final_jerseys,
    COALESCE(p.oneday_finish_points, 0::numeric) AS oneday_finish_points,
    COALESCE(p.stage_finish_points, 0::numeric) AS stage_finish_points,
    COALESCE(p.leader_day_points, 0::numeric) AS leader_day_points,
    COALESCE(p.final_gc_points, 0::numeric) AS final_gc_points,
    COALESCE(p.scoring_races, 0::bigint) AS scoring_races,
    COALESCE(p.scoring_stages, 0::bigint) AS scoring_stages
   FROM rider_seasons rs
     LEFT JOIN rider_international_points_by_season_v1 p ON p.season_year = rs.season_year AND p.rider_id = rs.rider_id
     LEFT JOIN rider_season_achievements_by_season_v1 a ON a.season_year = rs.season_year AND a.rider_id = rs.rider_id
     LEFT JOIN rider_stage_podiums_by_season_v1 pd ON pd.season_year = rs.season_year AND pd.rider_id = rs.rider_id;;
