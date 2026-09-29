create or replace view public.v_latest_rider_scout_reports as  SELECT DISTINCT ON (club_id, rider_id) id,
    club_id,
    rider_id,
    scout_staff_id,
    scouted_on_game_date,
    precision_score,
    precision_tier,
    report_json,
    created_at
   FROM rider_scout_reports
  ORDER BY club_id, rider_id, scouted_on_game_date DESC, created_at DESC;;

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

create or replace view public.free_agent_market_view as  SELECT fa.id AS free_agent_id,
    fa.rider_id,
    fa.status,
    fa.expected_salary_weekly,
    fa.min_acceptable_salary_weekly,
    fa.preferred_duration_seasons,
    fa.available_from_game_date,
    fa.expires_on_game_date,
    fa.created_at,
    r.first_name,
    r.last_name,
    r.display_name,
    r.country_code,
    r.role,
    r.overall,
    r.potential,
    r.birth_date
   FROM rider_free_agents fa
     JOIN riders r ON r.id = fa.rider_id
  WHERE fa.status = 'available'::text;;

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

create or replace view public.club_weekly_skill_change_widget_v as  WITH latest AS (
         SELECT max(rider_weekly_skill_changes.week_end_date) AS week_end_date
           FROM rider_weekly_skill_changes
        )
 SELECT cr.club_id,
    l.week_end_date,
    count(*) FILTER (WHERE c.delta_value > 0) AS positive_skill_changes,
    count(*) FILTER (WHERE c.delta_value < 0) AS negative_skill_changes,
    COALESCE(sum(c.delta_value), 0::bigint) AS net_delta_sum,
    count(DISTINCT c.rider_id) AS riders_changed
   FROM latest l
     JOIN rider_weekly_skill_changes c ON c.week_end_date = l.week_end_date
     JOIN club_riders cr ON cr.rider_id = c.rider_id
  GROUP BY cr.club_id, l.week_end_date;;

create or replace view public.rider_latest_weekly_development_v as  WITH latest AS (
         SELECT DISTINCT ON (s.rider_id) s.rider_id,
            s.week_start_date,
            s.week_end_date,
            s.processed_at,
            s.primary_source,
            s.source_summary,
            s.changed_attributes,
            s.positive_changes,
            s.negative_changes,
            s.total_net_change,
            s.overall_delta
           FROM rider_weekly_development_summaries s
          ORDER BY s.rider_id, s.week_end_date DESC, s.processed_at DESC
        ), current_roster_state AS (
         SELECT r.id AS rider_id,
            r.display_name,
            r.availability_status
           FROM riders r
        )
 SELECT l.rider_id,
    rs.display_name,
    rs.availability_status,
    l.week_start_date,
    l.week_end_date,
    l.processed_at,
    l.primary_source,
    l.source_summary,
    l.changed_attributes,
    l.positive_changes,
    l.negative_changes,
    l.total_net_change,
    l.overall_delta,
        CASE
            WHEN COALESCE(l.total_net_change, 0) <> 0 OR COALESCE(l.overall_delta, 0) <> 0 THEN 'changed'::text
            WHEN COALESCE((l.source_summary ->> 'regular_training_value'::text)::numeric, 0::numeric) > 0::numeric OR COALESCE((l.source_summary ->> 'training_camp_value'::text)::numeric, 0::numeric) > 0::numeric OR COALESCE((l.source_summary ->> 'race_days'::text)::integer, 0) > 0 THEN 'progress_only'::text
            WHEN (rs.availability_status = ANY (ARRAY['injured'::text, 'sick'::text])) AND COALESCE((l.source_summary ->> 'had_inactivity_decay'::text)::boolean, false) = true THEN 'blocked_injured_or_sick'::text
            WHEN COALESCE((l.source_summary ->> 'had_inactivity_decay'::text)::boolean, false) = true THEN 'inactive_decay'::text
            ELSE 'inactive'::text
        END AS ui_state,
        CASE
            WHEN COALESCE(l.total_net_change, 0) <> 0 OR COALESCE(l.overall_delta, 0) <> 0 THEN 'Skill changed'::text
            WHEN COALESCE((l.source_summary ->> 'regular_training_value'::text)::numeric, 0::numeric) > 0::numeric OR COALESCE((l.source_summary ->> 'training_camp_value'::text)::numeric, 0::numeric) > 0::numeric OR COALESCE((l.source_summary ->> 'race_days'::text)::integer, 0) > 0 THEN 'Progress made, no visible stat gain'::text
            WHEN (rs.availability_status = ANY (ARRAY['injured'::text, 'sick'::text])) AND COALESCE((l.source_summary ->> 'had_inactivity_decay'::text)::boolean, false) = true THEN 'No training this week due to injury/sickness'::text
            WHEN COALESCE((l.source_summary ->> 'had_inactivity_decay'::text)::boolean, false) = true THEN 'No meaningful training or racing this week'::text
            ELSE 'No meaningful progress this week'::text
        END AS ui_label
   FROM latest l
     JOIN current_roster_state rs ON rs.rider_id = l.rider_id;;

create or replace view public.rider_weekly_development_modal_v as  SELECT rider_id,
    display_name,
    availability_status,
    week_start_date,
    week_end_date,
    ui_state,
    ui_label,
    primary_source,
    changed_attributes,
    positive_changes,
    negative_changes,
    total_net_change,
    overall_delta,
    source_summary,
    COALESCE((source_summary ->> 'regular_training_days'::text)::integer, 0) AS regular_training_days,
    COALESCE((source_summary ->> 'training_camp_days'::text)::integer, 0) AS training_camp_days,
    COALESCE((source_summary ->> 'race_days'::text)::integer, 0) AS race_days,
    COALESCE((source_summary ->> 'meaningful_days'::text)::integer, 0) AS meaningful_days,
    COALESCE((source_summary ->> 'regular_training_value'::text)::numeric, 0::numeric) AS regular_training_value,
    COALESCE((source_summary ->> 'training_camp_value'::text)::numeric, 0::numeric) AS training_camp_value,
    COALESCE((source_summary ->> 'had_inactivity_decay'::text)::boolean, false) AS had_inactivity_decay
   FROM rider_latest_weekly_development_v d;;

create or replace view public.rider_latest_weekly_skill_deltas_v as  WITH latest AS (
         SELECT DISTINCT ON (s.rider_id) s.rider_id,
            s.week_end_date
           FROM rider_weekly_development_summaries s
          ORDER BY s.rider_id, s.week_end_date DESC
        )
 SELECT c.rider_id,
    r.display_name,
    c.week_start_date,
    c.week_end_date,
    c.attribute_code,
    c.old_value,
    c.new_value,
    c.delta_value
   FROM rider_weekly_skill_changes c
     JOIN latest l ON l.rider_id = c.rider_id AND l.week_end_date = c.week_end_date
     JOIN riders r ON r.id = c.rider_id;;

create or replace view public.club_weekly_skill_widget_v as  SELECT cr.club_id,
    d.week_start_date,
    d.week_end_date,
    count(*) FILTER (WHERE d.ui_state = 'changed'::text) AS riders_changed,
    count(*) FILTER (WHERE d.ui_state = 'progress_only'::text) AS riders_progress_only,
    count(*) FILTER (WHERE d.ui_state = 'blocked_injured_or_sick'::text) AS riders_blocked,
    count(*) FILTER (WHERE d.ui_state = ANY (ARRAY['inactive_decay'::text, 'inactive'::text])) AS riders_inactive,
    COALESCE(sum(d.positive_changes), 0::bigint) AS total_positive_changes,
    COALESCE(sum(d.negative_changes), 0::bigint) AS total_negative_changes,
    COALESCE(sum(d.total_net_change), 0::bigint) AS total_net_change,
    COALESCE(sum(d.overall_delta), 0::bigint) AS total_overall_delta
   FROM club_riders cr
     JOIN rider_latest_weekly_development_v d ON d.rider_id = cr.rider_id
  GROUP BY cr.club_id, d.week_start_date, d.week_end_date;;

create or replace view public.rider_last_weekly_skill_change as  WITH latest_summary AS (
         SELECT DISTINCT ON (rwsc.rider_id) rwsc.rider_id,
            rwsc.week_start_date,
            rwsc.week_end_date,
            rwsc.processed_at,
            rwsc.primary_source,
            rwsc.source_summary,
            rwsc.changed_attributes,
            rwsc.positive_changes,
            rwsc.negative_changes,
            rwsc.total_net_change,
            rwsc.overall_delta
           FROM rider_weekly_skill_changes rwsc
          WHERE rwsc.attribute_code = '__summary__'::text
          ORDER BY rwsc.rider_id, rwsc.week_end_date DESC, rwsc.processed_at DESC
        )
 SELECT ls.rider_id,
    r.display_name,
    ls.week_start_date,
    ls.week_end_date,
    ls.processed_at,
    ls.primary_source,
    ls.source_summary,
    ls.changed_attributes,
    ls.positive_changes,
    ls.negative_changes,
    ls.total_net_change,
    ls.overall_delta
   FROM latest_summary ls
     JOIN riders r ON r.id = ls.rider_id;;

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

create or replace view public.rider_season_achievements_by_season_v1 as  SELECT season_year,
    rider_id,
    count(*) FILTER (WHERE achievement_type = 'stage_win'::text)::integer AS stage_wins,
    count(*) FILTER (WHERE achievement_type = 'final_jersey'::text)::integer AS final_jerseys,
    count(DISTINCT race_id) FILTER (WHERE achievement_type = 'stage_win'::text)::integer AS races_with_stage_wins,
    count(DISTINCT race_id) FILTER (WHERE achievement_type = 'final_jersey'::text)::integer AS races_with_final_jerseys
   FROM rider_season_achievements_ledger_v1
  WHERE rider_id IS NOT NULL AND season_year IS NOT NULL
  GROUP BY season_year, rider_id;;

create or replace view public.race_stage_weather_decision_status_v1 as  SELECT id AS stage_id,
    race_id,
    stage_number,
    stage_date,
    weather_cancelled,
    weather_cancellation_reason,
    race_stage_weather_cancellation_reason_from_snapshot_v1(weather_snapshot, weather_summary) AS forecast_cancellation_reason,
    metadata ->> 'weather_final_decision_status'::text AS final_decision_status,
    metadata ->> 'weather_final_decision_reason'::text AS final_decision_reason,
    metadata -> 'weather_final_snapshot'::text AS final_weather_snapshot,
    metadata ->> 'weather_final_decision_at'::text AS final_decision_at,
        CASE
            WHEN weather_cancelled IS TRUE THEN 'cancelled'::text
            WHEN (metadata ->> 'weather_final_decision_status'::text) = 'cleared'::text THEN 'cleared'::text
            WHEN race_stage_weather_cancellation_reason_from_snapshot_v1(weather_snapshot, weather_summary) IS NOT NULL THEN 'forecast_risk'::text
            ELSE 'safe_forecast'::text
        END AS display_weather_decision_state,
    weather_summary
   FROM race_stages s;;

create or replace view public.club_profile_roster_view as  SELECT cr.club_id,
    r.id AS rider_id,
    COALESCE(NULLIF(TRIM(BOTH FROM concat_ws(' '::text, r.first_name, r.last_name)), ''::text), NULLIF(r.display_name, ''::text), 'Unknown rider'::text) AS display_name,
    r.country_code,
    r.role,
    r.birth_date
   FROM club_riders cr
     JOIN riders r ON r.id = cr.rider_id;;

create or replace view public.infrastructure_facility_max_levels as  SELECT facility_key,
    max(target_level)::integer AS max_level
   FROM infrastructure_facility_upgrade_config
  GROUP BY facility_key;;

create or replace view public.rider_profiles as  SELECT id,
    country_code,
    first_name,
    last_name,
    display_name,
    role,
    sprint,
    climbing,
    time_trial,
    endurance,
    flat,
    recovery,
    resistance,
    race_iq,
    teamwork,
    morale,
    potential,
    overall,
    created_at,
    birth_date,
    get_age_years_on_game_date(birth_date) AS age_years,
    image_url
   FROM riders r;;

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

create or replace view public.v_rider_latest_weekly_change_ui as  WITH latest_summary AS (
         SELECT rwsc.rider_id,
            rwsc.week_start_date,
            rwsc.week_end_date,
            rwsc.attribute_code,
            rwsc.old_value,
            rwsc.new_value,
            rwsc.delta_value,
            rwsc.processed_at,
            rwsc.primary_source,
            rwsc.source_summary,
            rwsc.changed_attributes,
            rwsc.positive_changes,
            rwsc.negative_changes,
            rwsc.total_net_change,
            rwsc.overall_delta,
            row_number() OVER (PARTITION BY rwsc.rider_id ORDER BY rwsc.week_end_date DESC, rwsc.processed_at DESC) AS rn
           FROM rider_weekly_skill_changes rwsc
          WHERE rwsc.attribute_code = '__summary__'::text
        )
 SELECT ls.rider_id,
    r.display_name,
    cr.club_id,
    club_current_display_name_v1(c.id, c.name) AS club_name,
    COALESCE(c.club_type, 'main'::text) AS club_type,
    c.club_tier,
    cr.assigned_role,
    r.availability_status,
    ls.week_start_date,
    ls.week_end_date,
    ls.processed_at,
    ls.primary_source,
    COALESCE(ls.changed_attributes, '[]'::jsonb) AS changed_attributes,
    COALESCE(ls.positive_changes, 0) AS positive_changes,
    COALESCE(ls.negative_changes, 0) AS negative_changes,
    COALESCE(ls.total_net_change, 0) AS total_net_change,
    COALESCE(ls.overall_delta, 0) AS overall_delta,
    COALESCE(ls.source_summary, '{}'::jsonb) AS source_summary,
    COALESCE((ls.source_summary ->> 'regular_training_days'::text)::integer, 0) AS regular_training_days,
    round(COALESCE((ls.source_summary ->> 'regular_training_value'::text)::numeric, 0::numeric), 4) AS regular_training_value,
    COALESCE((ls.source_summary ->> 'training_camp_days'::text)::integer, 0) AS training_camp_days,
    round(COALESCE((ls.source_summary ->> 'training_camp_value'::text)::numeric, 0::numeric), 4) AS training_camp_value,
    COALESCE((ls.source_summary ->> 'race_days'::text)::integer, 0) AS race_days,
    COALESCE((ls.source_summary ->> 'meaningful_days'::text)::integer, 0) AS meaningful_days,
    COALESCE((ls.source_summary ->> 'had_inactivity_decay'::text)::boolean, false) AS had_inactivity_decay,
        CASE
            WHEN (r.availability_status = ANY (ARRAY['injured'::text, 'sick'::text])) AND COALESCE((ls.source_summary ->> 'meaningful_days'::text)::integer, 0) = 0 THEN 'blocked_injured_or_sick'::text
            WHEN jsonb_array_length(COALESCE(ls.changed_attributes, '[]'::jsonb)) > 0 THEN 'visible_change'::text
            WHEN COALESCE((ls.source_summary ->> 'meaningful_days'::text)::integer, 0) > 0 THEN 'progress_only'::text
            WHEN COALESCE((ls.source_summary ->> 'had_inactivity_decay'::text)::boolean, false) THEN 'inactive'::text
            ELSE 'no_change'::text
        END AS ui_state,
        CASE
            WHEN (r.availability_status = ANY (ARRAY['injured'::text, 'sick'::text])) AND COALESCE((ls.source_summary ->> 'meaningful_days'::text)::integer, 0) = 0 THEN 'No training this week due to injury/sickness'::text
            WHEN jsonb_array_length(COALESCE(ls.changed_attributes, '[]'::jsonb)) > 0 THEN 'Visible skill changes this week'::text
            WHEN COALESCE((ls.source_summary ->> 'meaningful_days'::text)::integer, 0) > 0 THEN 'Progress made, no visible stat gain'::text
            WHEN COALESCE((ls.source_summary ->> 'had_inactivity_decay'::text)::boolean, false) THEN 'No meaningful progress this week'::text
            ELSE 'No visible change this week'::text
        END AS ui_label
   FROM latest_summary ls
     JOIN riders r ON r.id = ls.rider_id
     LEFT JOIN club_riders cr ON cr.rider_id = ls.rider_id
     LEFT JOIN clubs c ON c.id = cr.club_id AND c.deleted_at IS NULL
  WHERE ls.rn = 1;;

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

create or replace view public.race_engine_missing_participant_team_rows_v1 as  WITH rider_team_rows AS (
         SELECT rpr.race_id,
            rpr.team_id,
            min(rpr.team_name_snapshot) AS team_name_snapshot,
            min(rpr.country_code_snapshot) AS country_code_snapshot,
            count(*)::integer AS rider_count
           FROM race_participant_riders rpr
          WHERE rpr.team_id IS NOT NULL
          GROUP BY rpr.race_id, rpr.team_id
        ), race_dates AS (
         SELECT s.race_id,
            min(s.stage_date) AS first_stage_date
           FROM race_stages s
          GROUP BY s.race_id
        )
 SELECT r.id AS race_id,
    r.name AS race_name,
    r.category AS race_category,
    rd.first_stage_date,
    rtr.team_id,
    rtr.team_name_snapshot,
    rtr.country_code_snapshot,
    rtr.rider_count,
    COALESCE(existing.existing_team_rows, 0) AS existing_team_rows,
    COALESCE(existing.existing_accepted_team_rows, 0) AS existing_accepted_team_rows,
        CASE
            WHEN COALESCE(existing.existing_team_rows, 0) = 0 THEN 'missing_team_row'::text
            ELSE 'team_row_exists'::text
        END AS backfill_status,
        CASE
            WHEN COALESCE(existing.existing_team_rows, 0) = 0 THEN 'Insert one race_participant_teams row for this race/team from rider startlist snapshot.'::text
            ELSE 'No action needed.'::text
        END AS recommendation
   FROM rider_team_rows rtr
     JOIN races r ON r.id = rtr.race_id
     LEFT JOIN race_dates rd ON rd.race_id = rtr.race_id
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS existing_team_rows,
            count(*) FILTER (WHERE rpt.status = 'accepted'::text)::integer AS existing_accepted_team_rows
           FROM race_participant_teams rpt
          WHERE rpt.race_id = rtr.race_id AND rpt.team_id = rtr.team_id) existing ON true
  WHERE COALESCE(existing.existing_team_rows, 0) = 0;;

create or replace view public.race_engine_replay_density_audit_v1 as  SELECT race_name,
    race_category,
    stage_id,
    stage_number,
    stage_date,
    lower(COALESCE(stage_format, 'unknown'::text)) AS stage_format,
    distance_km,
    replay_frame_rows,
    simulation_run_count,
    estimated_replay_row_bytes,
    estimated_replay_row_size,
    estimated_metadata_bytes,
    estimated_metadata_size,
    avg_replay_row_bytes,
        CASE
            WHEN COALESCE(distance_km, 0::numeric) > 0::numeric THEN round(replay_frame_rows::numeric / distance_km, 2)
            ELSE NULL::numeric
        END AS replay_rows_per_km,
        CASE
            WHEN estimated_replay_row_bytes > 0 THEN round(estimated_metadata_bytes::numeric / estimated_replay_row_bytes::numeric * 100::numeric, 2)
            ELSE NULL::numeric
        END AS metadata_percent_of_estimated_row_size,
        CASE
            WHEN (lower(COALESCE(stage_format, ''::text)) = ANY (ARRAY['prologue'::text, 'individual_time_trial'::text, 'time_trial'::text, 'itt'::text])) AND replay_frame_rows > 3000 THEN true
            WHEN (lower(COALESCE(stage_format, ''::text)) = ANY (ARRAY['team_time_trial'::text, 'ttt'::text])) AND replay_frame_rows > 4000 THEN true
            WHEN (lower(COALESCE(stage_format, ''::text)) <> ALL (ARRAY['prologue'::text, 'individual_time_trial'::text, 'time_trial'::text, 'itt'::text, 'team_time_trial'::text, 'ttt'::text])) AND replay_frame_rows > 5000 THEN true
            ELSE false
        END AS too_many_rows_for_stage_type,
        CASE
            WHEN COALESCE(distance_km, 0::numeric) <= 0::numeric THEN false
            WHEN lower(COALESCE(stage_format, ''::text)) = 'prologue'::text AND (replay_frame_rows::numeric / GREATEST(distance_km, 1::numeric)) > 300::numeric THEN true
            WHEN (lower(COALESCE(stage_format, ''::text)) = ANY (ARRAY['individual_time_trial'::text, 'time_trial'::text, 'itt'::text])) AND (replay_frame_rows::numeric / GREATEST(distance_km, 1::numeric)) > 150::numeric THEN true
            WHEN (lower(COALESCE(stage_format, ''::text)) = ANY (ARRAY['team_time_trial'::text, 'ttt'::text])) AND (replay_frame_rows::numeric / GREATEST(distance_km, 1::numeric)) > 150::numeric THEN true
            WHEN (lower(COALESCE(stage_format, ''::text)) <> ALL (ARRAY['prologue'::text, 'individual_time_trial'::text, 'time_trial'::text, 'itt'::text, 'team_time_trial'::text, 'ttt'::text])) AND (replay_frame_rows::numeric / GREATEST(distance_km, 1::numeric)) > 60::numeric THEN true
            ELSE false
        END AS too_dense_per_km,
        CASE
            WHEN avg_replay_row_bytes >= 8000::numeric THEN 'critical_metadata_bloat'::text
            WHEN avg_replay_row_bytes >= 5000::numeric THEN 'high_metadata_bloat'::text
            WHEN avg_replay_row_bytes >= 2500::numeric THEN 'medium_metadata_bloat'::text
            ELSE 'normal_or_low_metadata'::text
        END AS metadata_bloat_level,
        CASE
            WHEN estimated_metadata_bytes > 0 AND estimated_replay_row_bytes > 0 AND (estimated_metadata_bytes::numeric / estimated_replay_row_bytes::numeric) >= 0.75 THEN true
            ELSE false
        END AS metadata_dominates_row_size,
        CASE
            WHEN lower(COALESCE(stage_format, ''::text)) = 'prologue'::text AND (replay_frame_rows > 3000 OR COALESCE(distance_km, 0::numeric) > 0::numeric AND (replay_frame_rows::numeric / GREATEST(distance_km, 1::numeric)) > 300::numeric) THEN 'prologue_replay_too_dense'::text
            WHEN (lower(COALESCE(stage_format, ''::text)) = ANY (ARRAY['individual_time_trial'::text, 'time_trial'::text, 'itt'::text])) AND (replay_frame_rows > 3000 OR COALESCE(distance_km, 0::numeric) > 0::numeric AND (replay_frame_rows::numeric / GREATEST(distance_km, 1::numeric)) > 150::numeric) THEN 'itt_replay_too_dense'::text
            WHEN (lower(COALESCE(stage_format, ''::text)) = ANY (ARRAY['team_time_trial'::text, 'ttt'::text])) AND (replay_frame_rows > 4000 OR COALESCE(distance_km, 0::numeric) > 0::numeric AND (replay_frame_rows::numeric / GREATEST(distance_km, 1::numeric)) > 150::numeric) THEN 'ttt_replay_too_dense'::text
            WHEN (lower(COALESCE(stage_format, ''::text)) <> ALL (ARRAY['prologue'::text, 'individual_time_trial'::text, 'time_trial'::text, 'itt'::text, 'team_time_trial'::text, 'ttt'::text])) AND (replay_frame_rows > 5000 OR COALESCE(distance_km, 0::numeric) > 0::numeric AND (replay_frame_rows::numeric / GREATEST(distance_km, 1::numeric)) > 60::numeric) THEN 'road_replay_too_dense'::text
            WHEN avg_replay_row_bytes >= 8000::numeric THEN 'metadata_row_too_large'::text
            ELSE 'acceptable_or_review'::text
        END AS replay_density_problem_type,
    latest_run_timestamp,
    real_days_since_latest_run,
    retention_days,
    retention_tier,
    keep_policy,
    retention_status
   FROM race_engine_replay_storage_by_stage_v1 s;;

create or replace view public.race_engine_stage_processing_function_inventory_v1 as  SELECT n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_get_function_result(p.oid) AS return_type,
    p.oid::regprocedure::text AS regprocedure_name,
    p.prosecdef AS security_definer,
    has_function_privilege('anon'::name, p.oid, 'execute'::text) AS anon_can_execute,
    has_function_privilege('authenticated'::name, p.oid, 'execute'::text) AS authenticated_can_execute,
    has_function_privilege('service_role'::name, p.oid, 'execute'::text) AS service_role_can_execute
   FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'::name AND (p.proname = ANY (ARRAY['run_race_stage_simulation_v1'::name, 'run_race_stage_road_race_v1'::name, 'run_race_stage_individual_time_trial_v1'::name, 'run_race_stage_team_time_trial_v1'::name, 'race_engine_finalize_time_trial_stage_v1'::name, 'race_engine_write_replay_frames_v1'::name, 'race_engine_write_stage_results_v1'::name, 'race_engine_write_stage_point_results_v1'::name, 'race_engine_write_cumulative_classifications_v1'::name, 'race_engine_write_replay_commentary_v1'::name, 'sync_race_stage_points_from_stage_json_v1'::name, 'generate_race_ranking_point_awards_v1'::name, 'generate_race_prize_awards_v1'::name, 'race_engine_pay_prize_awards_v1'::name, 'race_engine_apply_stage_fatigue_v1'::name, 'race_engine_get_stage_production_guard_v1'::name, 'race_engine_assert_stage_can_simulate_v1'::name, 'race_engine_try_stage_processing_lock_v1'::name]))
  ORDER BY p.proname, (pg_get_function_identity_arguments(p.oid));;

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

create or replace view public.race_participant_teams_v1 as  SELECT rte.id AS race_team_entry_id,
    rte.race_id,
    COALESCE(rte.participating_club_id, rte.club_id) AS club_id,
    rte.status,
    rte.entry_source,
    rte.is_ai_filler,
    rte.auto_filled_at,
    club_current_display_name_v1(participating_club.id, participating_club.name) AS club_name,
    participating_club.country_code,
    participating_club.club_tier,
    participating_club.world_tier,
    participating_club.reputation,
    participating_club.logo_path,
    participating_club.tier2_division,
    participating_club.tier3_division,
    count(rpr.id)::integer AS assigned_riders_count,
    rte.club_id AS owner_club_id,
    COALESCE(rte.participating_club_id, rte.club_id) AS participating_club_id
   FROM race_team_entries rte
     JOIN clubs participating_club ON participating_club.id = COALESCE(rte.participating_club_id, rte.club_id)
     LEFT JOIN race_participant_riders rpr ON rpr.race_id = rte.race_id AND rpr.team_id = COALESCE(rte.participating_club_id, rte.club_id)
  WHERE rte.status = 'accepted'::text
  GROUP BY rte.id, rte.race_id, rte.club_id, rte.participating_club_id, rte.status, rte.entry_source, rte.is_ai_filler, rte.auto_filled_at, participating_club.id, participating_club.name, participating_club.country_code, participating_club.club_tier, participating_club.world_tier, participating_club.reputation, participating_club.logo_path, participating_club.tier2_division, participating_club.tier3_division;;

create or replace view public.rider_international_points_all_time_v1 as  WITH totals AS (
         SELECT international_points_awards_ledger_v1.rider_id,
            max(international_points_awards_ledger_v1.rider_name_snapshot) AS rider_name_snapshot,
            max(international_points_awards_ledger_v1.team_name_snapshot) AS latest_team_name_snapshot,
            sum(international_points_awards_ledger_v1.rider_points) AS international_points,
            count(*) AS scoring_rows,
            count(DISTINCT international_points_awards_ledger_v1.race_id) AS scoring_races,
            count(DISTINCT international_points_awards_ledger_v1.stage_id) AS scoring_stages
           FROM international_points_awards_ledger_v1
          WHERE international_points_awards_ledger_v1.rider_id IS NOT NULL
          GROUP BY international_points_awards_ledger_v1.rider_id
        )
 SELECT rank() OVER (ORDER BY totals.international_points DESC, rider_name_snapshot, rider_id) AS international_rank,
    rider_id,
    rider_name_snapshot,
    latest_team_name_snapshot,
    COALESCE(international_points, 0::numeric) AS international_points,
    scoring_rows,
    scoring_races,
    scoring_stages
   FROM totals;;

create or replace view public.race_engine_function_audit_v1 as  WITH raw_functions AS (
         SELECT n.nspname AS schema_name,
            p.proname AS function_name,
            pg_get_function_identity_arguments(p.oid) AS arguments,
            p.oid AS function_oid,
            l.lanname AS language_name,
            p.prosecdef AS is_security_definer,
            p.provolatile AS volatility_code,
                CASE p.provolatile
                    WHEN 'i'::"char" THEN 'immutable'::text
                    WHEN 's'::"char" THEN 'stable'::text
                    WHEN 'v'::"char" THEN 'volatile'::text
                    ELSE p.provolatile::text
                END AS volatility_label,
            pg_get_functiondef(p.oid) AS function_def
           FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
             JOIN pg_language l ON l.oid = p.prolang
          WHERE (n.nspname = ANY (ARRAY['public'::name, 'finance'::name])) AND (p.proname ~~* 'race_%'::text OR p.proname ~~* like_escape('race\_%'::text, '\'::text) OR p.proname ~~* '%race%'::text OR p.proname ~~* '%ranking%'::text OR p.proname ~~* '%classification%'::text OR p.proname ~~* '%fatigue%'::text OR p.proname ~~* '%prize%'::text OR p.proname ~~* '%replay%'::text OR p.proname ~~* '%stage%'::text OR p.proname ~~* '%sponsor_objective%'::text OR p.proname ~~* '%finance%'::text)
        ), classified AS (
         SELECT rf.schema_name,
            rf.function_name,
            rf.arguments,
            rf.function_oid,
            rf.language_name,
            rf.is_security_definer,
            rf.volatility_code,
            rf.volatility_label,
            rf.function_def,
            NULLIF("substring"(rf.function_name::text, '_v([0-9]+)$'::text), ''::text)::integer AS version_number,
            regexp_replace(rf.function_name::text, '_v[0-9]+$'::text, '_vX'::text) AS version_family,
                CASE
                    WHEN rf.function_def ~~* '%returns trigger%'::text OR rf.function_name ~~* 'trg_%'::text OR rf.function_name ~~* 'trigger_%'::text OR rf.function_name ~~* '%_trigger_%'::text THEN 'trigger'::text
                    WHEN rf.schema_name = 'finance'::name THEN 'finance'::text
                    WHEN rf.function_name ~~* 'admin_%'::text OR rf.function_name ~~* '%admin%'::text OR rf.function_name ~~* '%force%'::text OR rf.function_name ~~* '%reset%'::text OR rf.function_name ~~* '%rebuild%'::text OR rf.function_name ~~* '%delete%'::text OR rf.function_name ~~* '%cleanup%'::text THEN 'admin_or_destructive'::text
                    WHEN rf.function_name ~~* '%finalize%'::text OR rf.function_name ~~* '%finaliser%'::text THEN 'finalizer'::text
                    WHEN rf.function_name ~~* '%run_%'::text OR rf.function_name ~~* 'run_%'::text OR rf.function_name ~~* '%simulate%'::text OR rf.function_name ~~* '%simulation%'::text OR rf.function_name ~~* '%process_race_stage_automation%'::text OR rf.function_name ~~* '%automation%'::text THEN 'runner_or_scheduler'::text
                    WHEN rf.function_name ~~* '%write%'::text OR rf.function_name ~~* '%sync_%'::text OR rf.function_name ~~* 'sync_%'::text OR rf.function_name ~~* '%generate%'::text OR rf.function_name ~~* '%award%'::text OR rf.function_name ~~* '%pay%'::text OR rf.function_name ~~* '%apply%'::text OR rf.function_name ~~* '%insert%'::text OR rf.function_name ~~* '%upsert%'::text THEN 'writer_or_mutator'::text
                    WHEN rf.function_name ~~* 'get_%'::text OR rf.function_name ~~* '%_view%'::text OR rf.function_name ~~* '%summary%'::text OR rf.function_name ~~* '%health%'::text OR rf.function_name ~~* '%read%'::text OR rf.function_name ~~* '%list%'::text THEN 'reader'::text
                    ELSE 'needs_manual_review'::text
                END AS component_type,
                CASE
                    WHEN rf.function_def ~~* '%insert into%'::text OR rf.function_def ~~* '%update public.%'::text OR rf.function_def ~~* '%update finance.%'::text OR rf.function_def ~~* '%delete from%'::text OR rf.function_def ~~* '%perform public.%write%'::text OR rf.function_def ~~* '%perform public.%apply%'::text OR rf.function_def ~~* '%perform public.%generate%'::text OR rf.function_def ~~* '%perform public.%pay%'::text OR rf.function_def ~~* '%perform public.%sync%'::text THEN true
                    ELSE false
                END AS definition_has_write_operations,
                CASE
                    WHEN rf.function_name ~~* '%replay%'::text THEN true
                    WHEN rf.function_def ~~* '%race_stage_replay_frames%'::text THEN true
                    ELSE false
                END AS touches_replay,
                CASE
                    WHEN rf.function_name ~~* '%result%'::text THEN true
                    WHEN rf.function_def ~~* '%race_stage_results%'::text THEN true
                    WHEN rf.function_def ~~* '%race_stage_point_results%'::text THEN true
                    ELSE false
                END AS touches_results,
                CASE
                    WHEN rf.function_name ~~* '%classification%'::text THEN true
                    WHEN rf.function_def ~~* '%race_classification_standings%'::text THEN true
                    WHEN rf.function_def ~~* '%race_cumulative_classifications%'::text THEN true
                    ELSE false
                END AS touches_classifications,
                CASE
                    WHEN rf.function_name ~~* '%ranking%'::text THEN true
                    WHEN rf.function_def ~~* '%race_ranking_point_awards%'::text THEN true
                    ELSE false
                END AS touches_rankings,
                CASE
                    WHEN rf.function_name ~~* '%prize%'::text THEN true
                    WHEN rf.function_def ~~* '%race_prize_awards%'::text THEN true
                    WHEN rf.function_def ~~* '%finance.%'::text THEN true
                    ELSE false
                END AS touches_prizes_or_finance,
                CASE
                    WHEN rf.function_name ~~* '%fatigue%'::text THEN true
                    WHEN rf.function_def ~~* '%fatigue%'::text THEN true
                    ELSE false
                END AS touches_fatigue,
                CASE
                    WHEN rf.function_def ~~* '%race_stage_simulation_runs%'::text THEN true
                    ELSE false
                END AS touches_simulation_runs,
            has_function_privilege('anon'::name, rf.function_oid, 'EXECUTE'::text) AS anon_can_execute,
            has_function_privilege('authenticated'::name, rf.function_oid, 'EXECUTE'::text) AS authenticated_can_execute,
            has_function_privilege('service_role'::name, rf.function_oid, 'EXECUTE'::text) AS service_role_can_execute
           FROM raw_functions rf
        ), versioned AS (
         SELECT c.schema_name,
            c.function_name,
            c.arguments,
            c.function_oid,
            c.language_name,
            c.is_security_definer,
            c.volatility_code,
            c.volatility_label,
            c.function_def,
            c.version_number,
            c.version_family,
            c.component_type,
            c.definition_has_write_operations,
            c.touches_replay,
            c.touches_results,
            c.touches_classifications,
            c.touches_rankings,
            c.touches_prizes_or_finance,
            c.touches_fatigue,
            c.touches_simulation_runs,
            c.anon_can_execute,
            c.authenticated_can_execute,
            c.service_role_can_execute,
            max(c.version_number) OVER (PARTITION BY c.schema_name, c.version_family) AS max_version_in_family
           FROM classified c
        )
 SELECT schema_name,
    function_name,
    arguments,
    language_name,
    is_security_definer,
    volatility_label,
    version_number,
    version_family,
    max_version_in_family,
        CASE
            WHEN version_number IS NOT NULL AND max_version_in_family IS NOT NULL AND version_number < max_version_in_family THEN true
            ELSE false
        END AS lower_version_candidate,
    component_type,
    definition_has_write_operations,
    touches_simulation_runs,
    touches_replay,
    touches_results,
    touches_classifications,
    touches_rankings,
    touches_prizes_or_finance,
    touches_fatigue,
    anon_can_execute,
    authenticated_can_execute,
    service_role_can_execute,
        CASE
            WHEN (component_type = ANY (ARRAY['runner_or_scheduler'::text, 'writer_or_mutator'::text, 'finalizer'::text, 'admin_or_destructive'::text, 'finance'::text])) AND (anon_can_execute = true OR authenticated_can_execute = true) THEN true
            WHEN definition_has_write_operations = true AND (anon_can_execute = true OR authenticated_can_execute = true) THEN true
            ELSE false
        END AS frontend_execute_risk,
        CASE
            WHEN component_type = 'reader'::text AND definition_has_write_operations = false THEN 'frontend_read_candidate'::text
            WHEN component_type = 'reader'::text AND definition_has_write_operations = true THEN 'reader_name_but_mutates_review'::text
            WHEN component_type = ANY (ARRAY['runner_or_scheduler'::text, 'writer_or_mutator'::text, 'finalizer'::text]) THEN 'backend_only_candidate'::text
            WHEN component_type = 'admin_or_destructive'::text THEN 'admin_only_candidate'::text
            WHEN component_type = 'trigger'::text THEN 'trigger_only_candidate'::text
            WHEN component_type = 'finance'::text THEN 'finance_backend_review'::text
            ELSE 'manual_review'::text
        END AS recommended_access_policy
   FROM versioned;;

create or replace view public.race_engine_replay_function_audit_v1 as  WITH base_functions AS MATERIALIZED (
         SELECT n.nspname AS schema_name,
            p.proname AS function_name,
            pg_get_function_identity_arguments(p.oid) AS arguments,
            p.oid AS function_oid,
            p.prosecdef AS is_security_definer,
                CASE p.provolatile
                    WHEN 'i'::"char" THEN 'immutable'::text
                    WHEN 's'::"char" THEN 'stable'::text
                    WHEN 'v'::"char" THEN 'volatile'::text
                    ELSE p.provolatile::text
                END AS volatility_label
           FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE (n.nspname = ANY (ARRAY['public'::name, 'finance'::name])) AND p.prokind = 'f'::"char"
        ), funcs AS (
         SELECT bf.schema_name,
            bf.function_name,
            bf.arguments,
            bf.function_oid,
            bf.is_security_definer,
            bf.volatility_label,
            pg_get_functiondef(bf.function_oid) AS function_def
           FROM base_functions bf
        ), filtered AS (
         SELECT funcs.schema_name,
            funcs.function_name,
            funcs.arguments,
            funcs.function_oid,
            funcs.is_security_definer,
            funcs.volatility_label,
            funcs.function_def
           FROM funcs
          WHERE funcs.function_name ~~* '%replay%'::text OR funcs.function_def ~~* '%race_stage_replay_frames%'::text
        ), classified AS (
         SELECT f.schema_name,
            f.function_name,
            f.arguments,
            f.function_oid,
            f.is_security_definer,
            f.volatility_label,
            f.function_def,
            NULLIF("substring"(f.function_name::text, '_v([0-9]+)$'::text), ''::text)::integer AS version_number,
            regexp_replace(f.function_name::text, '_v[0-9]+$'::text, '_vX'::text) AS version_family,
                CASE
                    WHEN f.function_def ~~* '%returns trigger%'::text OR f.function_name ~~* 'trg_%'::text OR f.function_name ~~* 'trigger_%'::text THEN 'trigger'::text
                    WHEN f.function_def ~~* '%insert into public.race_stage_replay_frames%'::text OR f.function_def ~~* '%insert into race_stage_replay_frames%'::text THEN 'replay_writer_insert'::text
                    WHEN f.function_def ~~* '%delete from public.race_stage_replay_frames%'::text OR f.function_def ~~* '%delete from race_stage_replay_frames%'::text THEN 'replay_delete_or_cleanup'::text
                    WHEN f.function_def ~~* '%update public.race_stage_replay_frames%'::text OR f.function_def ~~* '%update race_stage_replay_frames%'::text THEN 'replay_mutator_update'::text
                    WHEN f.function_name ~~* 'get_%'::text AND f.function_def !~~* '%insert into%'::text AND f.function_def !~~* '%update public.%'::text AND f.function_def !~~* '%delete from%'::text THEN 'replay_reader'::text
                    WHEN f.function_def ~~* '%race_stage_replay_frames%'::text AND (f.function_def ~~* '%insert into%'::text OR f.function_def ~~* '%update public.%'::text OR f.function_def ~~* '%delete from%'::text) THEN 'replay_mutator_other'::text
                    ELSE 'replay_related_review'::text
                END AS replay_function_type,
                CASE
                    WHEN f.function_def ~~* '%insert into public.race_stage_replay_frames%'::text OR f.function_def ~~* '%insert into race_stage_replay_frames%'::text OR f.function_def ~~* '%update public.race_stage_replay_frames%'::text OR f.function_def ~~* '%update race_stage_replay_frames%'::text OR f.function_def ~~* '%delete from public.race_stage_replay_frames%'::text OR f.function_def ~~* '%delete from race_stage_replay_frames%'::text THEN true
                    ELSE false
                END AS mutates_replay_frames,
                CASE
                    WHEN f.function_def ~~* '%race_stage_simulation_runs%'::text THEN true
                    ELSE false
                END AS touches_simulation_runs,
                CASE
                    WHEN f.function_def ~~* '%race_stage_results%'::text THEN true
                    ELSE false
                END AS touches_stage_results,
                CASE
                    WHEN f.function_def ~~* '%race_stage_rider_states%'::text THEN true
                    ELSE false
                END AS touches_rider_states,
                CASE
                    WHEN f.function_def ~~* '%race_stage_team_states%'::text THEN true
                    ELSE false
                END AS touches_team_states,
            has_function_privilege('anon'::name, f.function_oid, 'EXECUTE'::text) AS anon_can_execute,
            has_function_privilege('authenticated'::name, f.function_oid, 'EXECUTE'::text) AS authenticated_can_execute,
            has_function_privilege('service_role'::name, f.function_oid, 'EXECUTE'::text) AS service_role_can_execute
           FROM filtered f
        ), versioned AS (
         SELECT c.schema_name,
            c.function_name,
            c.arguments,
            c.function_oid,
            c.is_security_definer,
            c.volatility_label,
            c.function_def,
            c.version_number,
            c.version_family,
            c.replay_function_type,
            c.mutates_replay_frames,
            c.touches_simulation_runs,
            c.touches_stage_results,
            c.touches_rider_states,
            c.touches_team_states,
            c.anon_can_execute,
            c.authenticated_can_execute,
            c.service_role_can_execute,
            max(c.version_number) OVER (PARTITION BY c.schema_name, c.version_family) AS max_version_in_family
           FROM classified c
        )
 SELECT schema_name,
    function_name,
    arguments,
    is_security_definer,
    volatility_label,
    version_number,
    version_family,
    max_version_in_family,
        CASE
            WHEN version_number IS NOT NULL AND max_version_in_family IS NOT NULL AND version_number < max_version_in_family THEN true
            ELSE false
        END AS lower_version_candidate,
    replay_function_type,
    mutates_replay_frames,
    touches_simulation_runs,
    touches_stage_results,
    touches_rider_states,
    touches_team_states,
    anon_can_execute,
    authenticated_can_execute,
    service_role_can_execute,
        CASE
            WHEN mutates_replay_frames = true AND (anon_can_execute = true OR authenticated_can_execute = true) THEN true
            ELSE false
        END AS frontend_replay_mutation_risk,
        CASE
            WHEN replay_function_type = 'replay_reader'::text AND mutates_replay_frames = false THEN 'frontend_read_candidate'::text
            WHEN replay_function_type = ANY (ARRAY['replay_writer_insert'::text, 'replay_mutator_update'::text, 'replay_delete_or_cleanup'::text, 'replay_mutator_other'::text]) THEN 'backend_only_candidate'::text
            WHEN replay_function_type = 'trigger'::text THEN 'trigger_only_candidate'::text
            ELSE 'manual_review'::text
        END AS recommended_access_policy
   FROM versioned;;

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

create or replace view public.rider_stage_podiums_by_season_v1 as  SELECT EXTRACT(year FROM rr.start_date)::integer AS season_year,
    sr.rider_id,
    count(*) FILTER (WHERE sr.rank = 1 AND (sr.status IS NULL OR (lower(sr.status) <> ALL (ARRAY['dnf'::text, 'dns'::text, 'dsq'::text, 'otl'::text, 'abandoned'::text, 'did_not_finish'::text, 'did_not_start'::text, 'disqualified'::text]))))::integer AS stage_wins_from_results,
    count(*) FILTER (WHERE sr.rank >= 1 AND sr.rank <= 3 AND (sr.status IS NULL OR (lower(sr.status) <> ALL (ARRAY['dnf'::text, 'dns'::text, 'dsq'::text, 'otl'::text, 'abandoned'::text, 'did_not_finish'::text, 'did_not_start'::text, 'disqualified'::text]))))::integer AS stage_podiums,
    count(DISTINCT sr.race_id) FILTER (WHERE sr.rank >= 1 AND sr.rank <= 3 AND (sr.status IS NULL OR (lower(sr.status) <> ALL (ARRAY['dnf'::text, 'dns'::text, 'dsq'::text, 'otl'::text, 'abandoned'::text, 'did_not_finish'::text, 'did_not_start'::text, 'disqualified'::text]))))::integer AS races_with_stage_podiums
   FROM race_stage_results sr
     LEFT JOIN races rr ON rr.id = sr.race_id
  WHERE sr.rider_id IS NOT NULL
  GROUP BY (EXTRACT(year FROM rr.start_date)::integer), sr.rider_id;;

create or replace view public.rider_statistics_page_view as  SELECT r.id,
    r.display_name,
    r.country_code,
    r.role,
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
    r.birth_date,
    r.market_value,
    r.salary,
    r.contract_expires_season,
    r.availability_status,
    r.fatigue,
    r.image_url,
    roster.club_id,
    club_current_display_name_v1(c.id, c.name) AS club_name,
    c.club_tier,
    c.is_ai AS club_is_ai,
    c.is_active AS club_is_active,
    COALESCE(NULLIF(to_jsonb(r.*) ->> 'season_points_overall'::text, ''::text)::integer, NULLIF(to_jsonb(r.*) ->> 'overall_points'::text, ''::text)::integer, NULLIF(to_jsonb(r.*) ->> 'points_overall'::text, ''::text)::integer, NULLIF(to_jsonb(r.*) ->> 'season_points'::text, ''::text)::integer, NULLIF(to_jsonb(r.*) ->> 'points'::text, ''::text)::integer, 0) AS season_points_overall,
    COALESCE(NULLIF(to_jsonb(r.*) ->> 'season_points_sprint'::text, ''::text)::integer, NULLIF(to_jsonb(r.*) ->> 'sprint_points'::text, ''::text)::integer, NULLIF(to_jsonb(r.*) ->> 'points_sprint'::text, ''::text)::integer, 0) AS season_points_sprint,
    COALESCE(NULLIF(to_jsonb(r.*) ->> 'season_points_climbing'::text, ''::text)::integer, NULLIF(to_jsonb(r.*) ->> 'climbing_points'::text, ''::text)::integer, NULLIF(to_jsonb(r.*) ->> 'points_climbing'::text, ''::text)::integer, NULLIF(to_jsonb(r.*) ->> 'mountain_points'::text, ''::text)::integer, 0) AS season_points_climbing
   FROM riders r
     LEFT JOIN LATERAL ( SELECT cr.club_id
           FROM club_roster cr
          WHERE cr.rider_id = r.id
         LIMIT 1) roster ON true
     LEFT JOIN clubs c ON c.id = roster.club_id AND c.deleted_at IS NULL;;

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

create or replace view public.team_history_summary_view as  SELECT club_id,
    club_current_display_name_v1(club_id, club_name) AS club_name,
    country_code,
    count(*)::integer AS seasons_recorded,
    min(final_position) AS best_finish,
    avg(final_position)::numeric(10,2) AS avg_finish,
    sum(
        CASE
            WHEN final_position = 1 THEN 1
            ELSE 0
        END)::integer AS titles,
    sum(
        CASE
            WHEN final_position <= 3 THEN 1
            ELSE 0
        END)::integer AS top3_finishes
   FROM team_ranking_season_snapshots s
  GROUP BY club_id, (club_current_display_name_v1(club_id, club_name)), country_code;;

create or replace view public.team_international_points_all_time_v1 as  WITH totals AS (
         SELECT international_points_awards_ledger_v1.team_id,
            max(international_points_awards_ledger_v1.team_name_snapshot) AS team_name_snapshot,
            sum(international_points_awards_ledger_v1.team_points) AS international_points,
            count(*) AS scoring_rows,
            count(DISTINCT international_points_awards_ledger_v1.race_id) AS scoring_races,
            count(DISTINCT international_points_awards_ledger_v1.stage_id) AS scoring_stages
           FROM international_points_awards_ledger_v1
          WHERE international_points_awards_ledger_v1.team_id IS NOT NULL
          GROUP BY international_points_awards_ledger_v1.team_id
        )
 SELECT rank() OVER (ORDER BY totals.international_points DESC, team_name_snapshot, team_id) AS international_rank,
    team_id,
    team_name_snapshot,
    COALESCE(international_points, 0::numeric) AS international_points,
    scoring_rows,
    scoring_races,
    scoring_stages
   FROM totals;;

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

create or replace view public.team_titles_summary_view as  SELECT club_id,
    club_current_display_name_v1(club_id, club_name) AS club_name,
    country_code,
    count(*)::integer AS titles_won,
    max(season_number) AS last_title_season
   FROM team_ranking_past_winners w
  GROUP BY club_id, (club_current_display_name_v1(club_id, club_name)), country_code;;

create or replace view public.v_rider_latest_weekly_visible_deltas_ui as  SELECT ui.club_id,
    ui.club_name,
    ui.club_type,
    ui.club_tier,
    ui.rider_id,
    ui.display_name,
    ui.assigned_role,
    ui.availability_status,
    rwsc.week_start_date,
    rwsc.week_end_date,
    rwsc.processed_at,
    rwsc.attribute_code,
    rwsc.old_value,
    rwsc.new_value,
    rwsc.delta_value,
    rwsc.primary_source,
        CASE
            WHEN rwsc.delta_value > 0 THEN 'positive'::text
            WHEN rwsc.delta_value < 0 THEN 'negative'::text
            ELSE 'neutral'::text
        END AS delta_direction,
        CASE
            WHEN rwsc.delta_value > 0 THEN '+'::text || rwsc.delta_value::text
            ELSE rwsc.delta_value::text
        END AS delta_label
   FROM rider_weekly_skill_changes rwsc
     JOIN v_rider_latest_weekly_change_ui ui ON ui.rider_id = rwsc.rider_id AND ui.week_start_date = rwsc.week_start_date AND ui.week_end_date = rwsc.week_end_date
  WHERE rwsc.attribute_code <> '__summary__'::text AND COALESCE(rwsc.delta_value::integer, 0) <> 0;;

create or replace view public.v_rider_modal_skill_ui as  WITH attr AS (
         SELECT x.attribute_code
           FROM ( VALUES ('sprint'::text), ('climbing'::text), ('time_trial'::text), ('endurance'::text), ('flat'::text), ('recovery'::text), ('resistance'::text), ('race_iq'::text), ('teamwork'::text)) x(attribute_code)
        ), latest_visible_delta AS (
         SELECT z.rider_id,
            z.attribute_code,
            z.old_value,
            z.new_value,
            z.delta_value,
            z.primary_source,
            z.week_start_date,
            z.week_end_date,
            z.processed_at
           FROM ( SELECT rwsc.rider_id,
                    rwsc.week_start_date,
                    rwsc.week_end_date,
                    rwsc.attribute_code,
                    rwsc.old_value,
                    rwsc.new_value,
                    rwsc.delta_value,
                    rwsc.processed_at,
                    rwsc.primary_source,
                    rwsc.source_summary,
                    rwsc.changed_attributes,
                    rwsc.positive_changes,
                    rwsc.negative_changes,
                    rwsc.total_net_change,
                    rwsc.overall_delta,
                    row_number() OVER (PARTITION BY rwsc.rider_id, rwsc.attribute_code ORDER BY rwsc.week_end_date DESC, rwsc.processed_at DESC NULLS LAST) AS rn
                   FROM rider_weekly_skill_changes rwsc
                  WHERE (rwsc.attribute_code = ANY (ARRAY['sprint'::text, 'climbing'::text, 'time_trial'::text, 'endurance'::text, 'flat'::text, 'recovery'::text, 'resistance'::text, 'race_iq'::text, 'teamwork'::text])) AND COALESCE(rwsc.delta_value::integer, 0) <> 0) z
          WHERE z.rn = 1
        )
 SELECT r.id AS rider_id,
    r.display_name,
    cr.club_id,
    club_current_display_name_v1(c.id, c.name) AS club_name,
    COALESCE(c.club_type, 'main'::text) AS club_type,
    c.club_tier,
    cr.assigned_role,
    r.availability_status,
    a.attribute_code,
        CASE a.attribute_code
            WHEN 'sprint'::text THEN r.sprint
            WHEN 'climbing'::text THEN r.climbing
            WHEN 'time_trial'::text THEN r.time_trial
            WHEN 'endurance'::text THEN r.endurance
            WHEN 'flat'::text THEN r.flat
            WHEN 'recovery'::text THEN r.recovery
            WHEN 'resistance'::text THEN r.resistance
            WHEN 'race_iq'::text THEN r.race_iq
            WHEN 'teamwork'::text THEN r.teamwork
            ELSE NULL::smallint
        END AS current_value,
    d.old_value,
    d.new_value,
    d.delta_value,
        CASE
            WHEN d.delta_value > 0 THEN '+'::text || d.delta_value::text
            WHEN d.delta_value < 0 THEN d.delta_value::text
            ELSE NULL::text
        END AS delta_label,
        CASE
            WHEN d.delta_value > 0 THEN 'positive'::text
            WHEN d.delta_value < 0 THEN 'negative'::text
            ELSE NULL::text
        END AS delta_direction,
    d.primary_source,
    d.week_start_date,
    d.week_end_date,
    d.delta_value IS NOT NULL AS has_visible_delta
   FROM riders r
     LEFT JOIN club_riders cr ON cr.rider_id = r.id
     LEFT JOIN clubs c ON c.id = cr.club_id
     CROSS JOIN attr a
     LEFT JOIN latest_visible_delta d ON d.rider_id = r.id AND d.attribute_code = a.attribute_code
  WHERE c.deleted_at IS NULL OR c.id IS NULL;;

create or replace view public.v_rider_skill_card_deltas as  WITH summary_weeks AS (
         SELECT DISTINCT summary.rider_id,
            summary.week_start_date,
            summary.week_end_date,
            summary.processed_at
           FROM rider_weekly_development_summaries summary
        ), change_weeks AS (
         SELECT DISTINCT change_row_1.rider_id,
            change_row_1.week_start_date,
            change_row_1.week_end_date,
            change_row_1.processed_at
           FROM rider_weekly_skill_changes change_row_1
          WHERE change_row_1.week_start_date IS NOT NULL AND change_row_1.week_end_date IS NOT NULL
        ), all_candidate_weeks AS (
         SELECT summary_weeks.rider_id,
            summary_weeks.week_start_date,
            summary_weeks.week_end_date,
            summary_weeks.processed_at
           FROM summary_weeks
        UNION ALL
         SELECT change_weeks.rider_id,
            change_weeks.week_start_date,
            change_weeks.week_end_date,
            change_weeks.processed_at
           FROM change_weeks
        ), latest_processed_week AS (
         SELECT DISTINCT ON (candidate.rider_id) candidate.rider_id,
            candidate.week_start_date,
            candidate.week_end_date,
            candidate.processed_at
           FROM all_candidate_weeks candidate
          ORDER BY candidate.rider_id, candidate.week_end_date DESC, candidate.week_start_date DESC, candidate.processed_at DESC
        ), latest_week_changes AS (
         SELECT DISTINCT ON (change_row_1.rider_id, change_row_1.attribute_code) change_row_1.rider_id,
            change_row_1.attribute_code,
            change_row_1.old_value,
            change_row_1.new_value,
            change_row_1.delta_value,
            change_row_1.primary_source,
            change_row_1.week_start_date,
            change_row_1.week_end_date,
            change_row_1.processed_at
           FROM rider_weekly_skill_changes change_row_1
             JOIN latest_processed_week latest_week ON latest_week.rider_id = change_row_1.rider_id AND latest_week.week_start_date = change_row_1.week_start_date AND latest_week.week_end_date = change_row_1.week_end_date
          WHERE change_row_1.attribute_code = ANY (ARRAY['sprint'::text, 'climbing'::text, 'time_trial'::text, 'endurance'::text, 'flat'::text, 'recovery'::text, 'resistance'::text, 'race_iq'::text, 'teamwork'::text])
          ORDER BY change_row_1.rider_id, change_row_1.attribute_code, change_row_1.processed_at DESC
        ), current_skill_rows AS (
         SELECT rider.id AS rider_id,
            skill.attribute_code,
            skill.current_value
           FROM riders rider
             CROSS JOIN LATERAL ( VALUES ('sprint'::text,rider.sprint::integer), ('climbing'::text,rider.climbing::integer), ('time_trial'::text,rider.time_trial::integer), ('endurance'::text,rider.endurance::integer), ('flat'::text,rider.flat::integer), ('recovery'::text,rider.recovery::integer), ('resistance'::text,rider.resistance::integer), ('race_iq'::text,rider.race_iq::integer), ('teamwork'::text,rider.teamwork::integer)) skill(attribute_code, current_value)
        )
 SELECT current_skill.rider_id,
    current_skill.attribute_code,
    current_skill.current_value,
    change_row.old_value::integer AS old_value,
    change_row.new_value::integer AS new_value,
    change_row.delta_value::integer AS delta_value,
        CASE
            WHEN change_row.delta_value > 0 THEN '+'::text || change_row.delta_value::text
            WHEN change_row.delta_value < 0 THEN change_row.delta_value::text
            ELSE NULL::text
        END AS delta_label,
        CASE
            WHEN change_row.delta_value > 0 THEN 'positive'::text
            WHEN change_row.delta_value < 0 THEN 'negative'::text
            ELSE NULL::text
        END AS delta_direction,
    change_row.primary_source,
    change_row.week_start_date,
    change_row.week_end_date,
    change_row.delta_value IS NOT NULL AND change_row.delta_value <> 0 AS has_visible_delta
   FROM current_skill_rows current_skill
     LEFT JOIN latest_week_changes change_row ON change_row.rider_id = current_skill.rider_id AND change_row.attribute_code = current_skill.attribute_code;;

create or replace view public.race_stage_weather_cancellation_candidates_v1 as  SELECT id AS stage_id,
    race_id,
    stage_number,
    stage_date,
    weather_cancelled,
    weather_cancellation_reason,
    weather_cancelled_at,
    weather_summary,
    race_stage_weather_condition_text_v2(id) AS weather_condition_text,
    race_stage_weather_snow_cm_v2(id) AS snow_cm,
    race_stage_weather_avg_temp_c_v1(id) AS avg_temp_c,
    race_stage_weather_min_temp_c_v1(id) AS min_temp_c,
    race_stage_weather_max_temp_c_v1(id) AS max_temp_c,
    race_stage_weather_cancellation_reason_v1(id) AS cancellation_reason,
        CASE
            WHEN race_stage_weather_cancellation_reason_v1(id) = 'snow'::text THEN true
            WHEN race_stage_weather_cancellation_reason_v1(id) = 'temperature_below_5c'::text THEN true
            ELSE false
        END AS should_cancel_for_weather
   FROM race_stages rs;;

create or replace view public.race_team_mandatory_jersey_status_v1 as  SELECT t.race_id,
    t.club_id AS team_id,
    t.owner_club_id,
    t.club_name,
    t.is_ai_filler,
    universal_race_team_required_jerseys_v1(t.race_id, t.club_id) AS required_jersey_units,
    COALESCE(s.quantity_available, 0) AS summary_quantity_available,
    universal_race_team_usable_jerseys_v1(t.club_id) AS durable_usable_units,
    GREATEST(COALESCE(s.quantity_available, 0), universal_race_team_usable_jerseys_v1(t.club_id)) AS effective_available_before_reconciliation,
    GREATEST(universal_race_team_required_jerseys_v1(t.race_id, t.club_id) - GREATEST(COALESCE(s.quantity_available, 0), universal_race_team_usable_jerseys_v1(t.club_id)), 0) AS current_shortage_before_reconciliation,
    d.from_stage_id AS disqualified_from_stage_id,
    d.from_stage_number AS disqualified_from_stage_number,
    d.reason_code AS disqualification_reason,
    d.id IS NOT NULL AS is_disqualified
   FROM race_participant_teams_v1 t
     LEFT JOIN club_race_supplies s ON s.club_id = t.club_id AND s.supply_key = 'race_jersey_complete'::text
     LEFT JOIN race_team_stage_disqualifications d ON d.race_id = t.race_id AND d.team_id = t.club_id;;

create or replace view public.rider_current_national_champion_v1 as  SELECT champion_rider_id AS rider_id,
    country_code,
    season_number,
    final_race_id,
    champion_name_snapshot,
    completed_at
   FROM national_championship_editions e
  WHERE status = 'completed'::text AND champion_rider_id IS NOT NULL;;

create or replace view public.race_engine_stage_sporting_integrity_v1 as  WITH stage_meta AS (
         SELECT stage.id AS stage_id,
            stage.race_id,
            stage.stage_number,
            stage.stage_date,
            COALESCE(jsonb_array_length(COALESCE(stage.intermediate_sprints_json, '[]'::jsonb)), 0) AS current_stage_json_sprint_count,
            COALESCE(jsonb_array_length(COALESCE(stage.mountain_climbs_json, '[]'::jsonb)), 0) AS current_stage_json_kom_count,
            (EXISTS ( SELECT 1
                   FROM race_stage_simulation_runs run
                  WHERE run.stage_id = stage.id)) AS has_simulation_run,
            (EXISTS ( SELECT 1
                   FROM race_stage_authoritative_runs authority
                  WHERE authority.stage_id = stage.id)) AS has_authoritative_run
           FROM race_stages stage
        ), canonical AS (
         SELECT point.stage_id,
            count(*) FILTER (WHERE upper(point.point_type) = 'START'::text)::integer AS start_count,
            count(*) FILTER (WHERE upper(point.point_type) = 'FINISH'::text)::integer AS finish_count,
            count(*) FILTER (WHERE upper(point.point_type) = ANY (ARRAY['INTERMEDIATE_SPRINT'::text, 'BONUS_SPRINT'::text]))::integer AS sprint_count,
            count(*) FILTER (WHERE upper(point.point_type) = 'KOM'::text)::integer AS kom_count,
            count(*)::integer AS point_count,
            COALESCE(sum(
                CASE
                    WHEN upper(point.point_type) = 'START'::text THEN 0
                    ELSE GREATEST(
                    CASE
                        WHEN jsonb_typeof(point.points_scheme) = 'array'::text THEN jsonb_array_length(point.points_scheme)
                        ELSE 0
                    END,
                    CASE
                        WHEN jsonb_typeof(point.time_bonus_seconds) = 'array'::text THEN jsonb_array_length(point.time_bonus_seconds)
                        ELSE 0
                    END)
                END), 0::bigint)::integer AS expected_point_result_rows,
            count(*) FILTER (WHERE (upper(point.point_type) <> ALL (ARRAY['START'::text, 'FINISH'::text, 'INTERMEDIATE_SPRINT'::text, 'BONUS_SPRINT'::text, 'KOM'::text])) OR point.km_from_start < 0::numeric OR point.km_from_start > stage.distance_km OR jsonb_typeof(point.points_scheme) <> 'array'::text OR jsonb_typeof(point.time_bonus_seconds) <> 'array'::text OR upper(point.point_type) <> 'START'::text AND GREATEST(
                CASE
                    WHEN jsonb_typeof(point.points_scheme) = 'array'::text THEN jsonb_array_length(point.points_scheme)
                    ELSE 0
                END,
                CASE
                    WHEN jsonb_typeof(point.time_bonus_seconds) = 'array'::text THEN jsonb_array_length(point.time_bonus_seconds)
                    ELSE 0
                END) <= 0)::integer AS invalid_canonical_rows
           FROM race_stage_points point
             JOIN race_stages stage ON stage.id = point.stage_id
          GROUP BY point.stage_id
        ), actual AS (
         SELECT result.stage_id,
            count(*)::integer AS actual_point_result_rows
           FROM race_stage_point_results result
          GROUP BY result.stage_id
        ), per_point_mismatch AS (
         SELECT point.stage_id,
            count(*) FILTER (WHERE upper(point.point_type) <> 'START'::text AND COALESCE(actual_point.row_count, 0) <> GREATEST(
                CASE
                    WHEN jsonb_typeof(point.points_scheme) = 'array'::text THEN jsonb_array_length(point.points_scheme)
                    ELSE 0
                END,
                CASE
                    WHEN jsonb_typeof(point.time_bonus_seconds) = 'array'::text THEN jsonb_array_length(point.time_bonus_seconds)
                    ELSE 0
                END))::integer AS mismatched_scoring_points
           FROM race_stage_points point
             LEFT JOIN LATERAL ( SELECT count(*)::integer AS row_count
                   FROM race_stage_point_results result
                  WHERE result.stage_id = point.stage_id AND result.point_id = point.id) actual_point ON true
          GROUP BY point.stage_id
        )
 SELECT meta.stage_id,
    meta.race_id,
    meta.stage_number,
    meta.stage_date,
    COALESCE(canonical.start_count, 0) AS start_count,
    COALESCE(canonical.finish_count, 0) AS finish_count,
    COALESCE(canonical.sprint_count, 0) AS sprint_count,
    meta.current_stage_json_sprint_count AS expected_sprint_points,
    COALESCE(canonical.kom_count, 0) AS kom_count,
    meta.current_stage_json_kom_count AS expected_kom_points,
    COALESCE(canonical.point_count, 0) AS canonical_point_count,
    COALESCE(canonical.expected_point_result_rows, 0) AS expected_point_result_rows,
    COALESCE(actual.actual_point_result_rows, 0) AS actual_point_result_rows,
    COALESCE(per_point_mismatch.mismatched_scoring_points, 0) AS mismatched_scoring_points,
    COALESCE(canonical.start_count, 0) = 1 AND COALESCE(canonical.finish_count, 0) = 1 AND COALESCE(canonical.point_count, 0) >= 2 AND COALESCE(canonical.invalid_canonical_rows, 0) = 0 AS canonical_point_contract_complete,
    COALESCE(canonical.expected_point_result_rows, 0) = COALESCE(actual.actual_point_result_rows, 0) AND COALESCE(per_point_mismatch.mismatched_scoring_points, 0) = 0 AS point_results_complete,
        CASE
            WHEN COALESCE(canonical.point_count, 0) = 0 AND NOT meta.has_simulation_run AND NOT meta.has_authoritative_run THEN 'awaiting_point_contract_preparation'::text
            WHEN COALESCE(canonical.start_count, 0) <> 1 OR COALESCE(canonical.finish_count, 0) <> 1 OR COALESCE(canonical.point_count, 0) < 2 OR COALESCE(canonical.invalid_canonical_rows, 0) <> 0 THEN 'canonical_point_contract_incomplete'::text
            WHEN meta.has_authoritative_run AND (COALESCE(canonical.expected_point_result_rows, 0) <> COALESCE(actual.actual_point_result_rows, 0) OR COALESCE(per_point_mismatch.mismatched_scoring_points, 0) <> 0) THEN 'point_results_incomplete'::text
            WHEN NOT meta.has_authoritative_run THEN 'awaiting_sporting_output'::text
            ELSE 'sporting_point_integrity_ok'::text
        END AS sporting_point_integrity_status,
    meta.current_stage_json_sprint_count,
    meta.current_stage_json_kom_count,
    COALESCE(canonical.sprint_count, 0) <> meta.current_stage_json_sprint_count OR COALESCE(canonical.kom_count, 0) <> meta.current_stage_json_kom_count AS canonical_vs_stage_json_drift,
    meta.has_simulation_run,
    meta.has_authoritative_run
   FROM stage_meta meta
     LEFT JOIN canonical ON canonical.stage_id = meta.stage_id
     LEFT JOIN actual ON actual.stage_id = meta.stage_id
     LEFT JOIN per_point_mismatch ON per_point_mismatch.stage_id = meta.stage_id;;

create or replace view public.race_rider_public_identity_v1 as  SELECT id,
    first_name,
    last_name,
    display_name,
    country_code
   FROM riders r
  WHERE (EXISTS ( SELECT 1
           FROM race_participant_riders rpr
          WHERE rpr.rider_id = r.id));;

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

create or replace view public.race_engine_paid_orphan_prize_award_audit_v1 as  WITH orphan_stages AS (
         SELECT i.race_id AS orphan_race_id,
            i.race_name AS orphan_race_name,
            i.race_category AS orphan_race_category,
            i.stage_id AS orphan_stage_id,
            i.stage_number AS orphan_stage_number,
            i.stage_date AS orphan_stage_date,
            i.stage_format AS orphan_stage_format
           FROM race_engine_stage_output_integrity_v1 i
          WHERE i.simulation_run_rows = 0 AND i.completed_simulation_run_rows = 0 AND i.stage_result_rows = 0 AND i.stage_point_result_rows = 0 AND i.classification_rows = 0 AND i.ranking_award_rows = 0 AND i.prize_award_rows > 0 AND i.replay_frame_rows = 0 AND i.rider_state_rows = 0 AND i.team_state_rows = 0
        ), prize_rows AS (
         SELECT os.orphan_race_id,
            os.orphan_race_name,
            os.orphan_race_category,
            os.orphan_stage_id,
            os.orphan_stage_number,
            os.orphan_stage_date,
            os.orphan_stage_format,
            to_jsonb(pa.*) AS prize_row_json,
            COALESCE(NULLIF(to_jsonb(pa.*) ->> 'after_stage_id'::text, ''::text)::uuid, NULLIF(to_jsonb(pa.*) ->> 'stage_id'::text, ''::text)::uuid) AS resolved_stage_id,
            (lower(COALESCE(to_jsonb(pa.*) ->> 'payment_status'::text, ''::text)) = ANY (ARRAY['paid'::text, 'processed'::text, 'complete'::text, 'completed'::text])) OR (lower(COALESCE(to_jsonb(pa.*) ->> 'status'::text, ''::text)) = ANY (ARRAY['paid'::text, 'processed'::text, 'complete'::text, 'completed'::text])) OR lower(COALESCE(to_jsonb(pa.*) ->> 'is_paid'::text, 'false'::text)) = 'true'::text OR lower(COALESCE(to_jsonb(pa.*) ->> 'paid'::text, 'false'::text)) = 'true'::text OR NULLIF(to_jsonb(pa.*) ->> 'paid_at'::text, ''::text) IS NOT NULL OR NULLIF(to_jsonb(pa.*) ->> 'processed_at'::text, ''::text) IS NOT NULL AS looks_paid_or_processed
           FROM orphan_stages os
             JOIN race_prize_awards pa ON COALESCE(NULLIF(to_jsonb(pa.*) ->> 'after_stage_id'::text, ''::text)::uuid, NULLIF(to_jsonb(pa.*) ->> 'stage_id'::text, ''::text)::uuid) = os.orphan_stage_id
        )
 SELECT orphan_race_id AS race_id,
    orphan_race_name AS race_name,
    orphan_race_category AS race_category,
    orphan_stage_id AS stage_id,
    orphan_stage_number AS stage_number,
    orphan_stage_date AS stage_date,
    orphan_stage_format AS stage_format,
    resolved_stage_id,
    looks_paid_or_processed,
    prize_row_json ->> 'id'::text AS prize_award_id,
    prize_row_json ->> 'race_id'::text AS prize_race_id,
    prize_row_json ->> 'after_stage_id'::text AS after_stage_id,
    prize_row_json ->> 'stage_id'::text AS prize_stage_id,
    prize_row_json ->> 'club_id'::text AS club_id,
    prize_row_json ->> 'team_id'::text AS team_id,
    prize_row_json ->> 'rider_id'::text AS rider_id,
    prize_row_json ->> 'amount'::text AS amount,
    prize_row_json ->> 'prize_amount'::text AS prize_amount,
    prize_row_json ->> 'money_amount'::text AS money_amount,
    prize_row_json ->> 'currency_amount'::text AS currency_amount,
    prize_row_json ->> 'status'::text AS status,
    prize_row_json ->> 'payment_status'::text AS payment_status,
    prize_row_json ->> 'is_paid'::text AS is_paid,
    prize_row_json ->> 'paid'::text AS paid,
    prize_row_json ->> 'paid_at'::text AS paid_at,
    prize_row_json ->> 'processed_at'::text AS processed_at,
    prize_row_json ->> 'created_at'::text AS created_at,
    prize_row_json ->> 'updated_at'::text AS updated_at,
    prize_row_json ->> 'source'::text AS source,
    prize_row_json ->> 'source_type'::text AS source_type,
    prize_row_json
   FROM prize_rows;;

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

create or replace view public.race_engine_paid_orphan_prize_award_detail_v1 as  SELECT race_id,
    race_name,
    race_category,
    stage_id,
    stage_number,
    stage_date,
    stage_format,
    looks_paid_or_processed,
    prize_row_json ->> 'id'::text AS prize_award_id,
    prize_row_json ->> 'race_id'::text AS prize_race_id,
    prize_row_json ->> 'stage_id'::text AS prize_stage_id,
    prize_row_json ->> 'after_stage_id'::text AS after_stage_id,
    prize_row_json ->> 'rank'::text AS rank_text,
        CASE
            WHEN (prize_row_json ->> 'rank'::text) ~ '^-?[0-9]+$'::text THEN (prize_row_json ->> 'rank'::text)::integer
            ELSE NULL::integer
        END AS rank_number,
    prize_row_json ->> 'bucket_key'::text AS bucket_key,
    prize_row_json ->> 'source_type'::text AS source_type,
    prize_row_json ->> 'recipient_type'::text AS recipient_type,
    prize_row_json ->> 'team_id'::text AS team_id,
    prize_row_json ->> 'club_id'::text AS club_id,
    prize_row_json ->> 'rider_id'::text AS rider_id,
    prize_row_json ->> 'team_name_snapshot'::text AS team_name_snapshot,
    prize_row_json ->> 'display_name_snapshot'::text AS display_name_snapshot,
    prize_row_json ->> 'amount_cash'::text AS amount_cash_text,
        CASE
            WHEN (prize_row_json ->> 'amount_cash'::text) ~ '^-?[0-9]+(\.[0-9]+)?$'::text THEN (prize_row_json ->> 'amount_cash'::text)::numeric
            ELSE 0::numeric
        END AS amount_cash,
    prize_row_json ->> 'status'::text AS status,
    prize_row_json ->> 'paid_at'::text AS paid_at,
    prize_row_json ->> 'created_at'::text AS created_at,
    prize_row_json ->> 'updated_at'::text AS updated_at,
    (prize_row_json -> 'metadata'::text) ->> 'paid_by'::text AS paid_by,
    (prize_row_json -> 'metadata'::text) ->> 'payment_club_id'::text AS payment_club_id,
    (prize_row_json -> 'metadata'::text) ->> 'participating_club_id'::text AS participating_club_id,
    (prize_row_json -> 'metadata'::text) ->> 'stage_pool_count'::text AS stage_pool_count,
    prize_row_json
   FROM race_engine_paid_orphan_prize_award_audit_v1 a;;

create or replace view public.race_engine_paid_orphan_prize_finance_transactions_v1 as  WITH matched_tx AS (
         SELECT DISTINCT ON (t.id) t.id AS transaction_id,
            t.type AS transaction_type,
            t.metadata,
            t.created_at,
            t.created_by,
            t.idempotency_key,
            to_jsonb(t.*) AS transaction_json,
            NULLIF(t.metadata ->> 'stage_id'::text, ''::text)::uuid AS metadata_stage_id,
            t.metadata ->> 'race_prize_award_id'::text AS metadata_race_prize_award_id,
            t.metadata ->> 'source_transaction_id'::text AS metadata_source_transaction_id,
            t.metadata ->> 'race_id'::text AS metadata_race_id,
            t.metadata ->> 'club_id'::text AS metadata_club_id,
            t.metadata ->> 'payment_club_id'::text AS metadata_payment_club_id,
            t.metadata ->> 'participating_club_id'::text AS metadata_participating_club_id,
            t.metadata ->> 'rider_id'::text AS metadata_rider_id,
            t.metadata ->> 'team_name'::text AS metadata_team_name,
            t.metadata ->> 'rider_name'::text AS metadata_rider_name,
            t.metadata ->> 'bucket_key'::text AS metadata_bucket_key,
            t.metadata ->> 'source_type'::text AS metadata_source_type,
            t.metadata ->> 'source'::text AS metadata_source,
                CASE
                    WHEN (t.metadata ->> 'amount'::text) ~ '^-?[0-9]+(\.[0-9]+)?$'::text THEN (t.metadata ->> 'amount'::text)::numeric
                    ELSE 0::numeric
                END AS metadata_amount,
                CASE
                    WHEN (t.metadata ->> 'gross_amount'::text) ~ '^-?[0-9]+(\.[0-9]+)?$'::text THEN (t.metadata ->> 'gross_amount'::text)::numeric
                    ELSE 0::numeric
                END AS metadata_gross_amount,
                CASE
                    WHEN (t.metadata ->> 'tax_amount'::text) ~ '^-?[0-9]+(\.[0-9]+)?$'::text THEN (t.metadata ->> 'tax_amount'::text)::numeric
                    ELSE 0::numeric
                END AS metadata_tax_amount
           FROM finance.transactions t
          WHERE (EXISTS ( SELECT 1
                   FROM race_engine_paid_orphan_prize_award_detail_v1 a
                  WHERE NULLIF(t.metadata ->> 'stage_id'::text, ''::text)::uuid = a.stage_id)) OR (EXISTS ( SELECT 1
                   FROM race_engine_paid_orphan_prize_award_detail_v1 a
                  WHERE (t.metadata ->> 'race_prize_award_id'::text) = a.prize_award_id))
        )
 SELECT i.race_id,
    i.race_name,
    i.race_category,
    i.stage_id,
    i.stage_number,
    i.stage_date,
    i.stage_format,
    mt.transaction_id,
    mt.transaction_type,
    mt.created_at,
    mt.created_by,
    mt.idempotency_key,
    mt.metadata_stage_id,
    mt.metadata_race_prize_award_id,
    mt.metadata_source_transaction_id,
    mt.metadata_race_id,
    mt.metadata_club_id,
    mt.metadata_payment_club_id,
    mt.metadata_participating_club_id,
    mt.metadata_rider_id,
    mt.metadata_team_name,
    mt.metadata_rider_name,
    mt.metadata_bucket_key,
    mt.metadata_source_type,
    mt.metadata_source,
    mt.metadata_amount,
    mt.metadata_gross_amount,
    mt.metadata_tax_amount,
    mt.metadata,
    mt.transaction_json
   FROM matched_tx mt
     JOIN race_engine_stage_output_integrity_v1 i ON i.stage_id = mt.metadata_stage_id;;

create or replace view public.team_ranking_ordered_standings_by_season_v1 as  WITH base AS (
         SELECT tb.season_year,
            tb.team_id,
            tb.team_name,
            tb.club_tier,
                CASE
                    WHEN tb.club_tier = 'worldteam'::text THEN 'WORLD'::text
                    WHEN tb.club_tier = 'proteam'::text THEN tb.tier2_division
                    WHEN tb.club_tier = 'continental'::text THEN tb.tier3_division
                    WHEN tb.club_tier = 'amateur'::text THEN tb.amateur_division
                    ELSE NULL::text
                END AS division,
            tb.international_points,
            tb.completed_race_count,
            tb.race_reputation_value
           FROM team_ranking_tiebreakers_by_season_v1 tb
        )
 SELECT row_number() OVER (PARTITION BY season_year, club_tier, (COALESCE(division, 'WORLD'::text)) ORDER BY international_points DESC, completed_race_count DESC, race_reputation_value DESC, (lower(team_name)), team_id)::integer AS ranking_position,
    season_year,
    team_id,
    team_name,
    club_tier,
    division,
    international_points,
    completed_race_count,
    race_reputation_value
   FROM base;;

create or replace view public.rider_statistics_page_international_v1 as  WITH current_season AS (
         SELECT team_ranking_get_current_season_year_v1() AS season_year
        ), current_rider_club AS (
         SELECT DISTINCT ON (cr.rider_id) cr.rider_id,
            cr.club_id
           FROM club_riders cr
             JOIN clubs c1 ON c1.id = cr.club_id
          WHERE c1.deleted_at IS NULL
          ORDER BY cr.rider_id, cr.created_at DESC NULLS LAST, cr.club_id
        )
 SELECT r.id,
    r.id AS rider_id,
    cs.season_year,
    COALESCE(NULLIF(concat_ws(' '::text, NULLIF(r.first_name, ''::text), NULLIF(r.last_name, ''::text)), ''::text), NULLIF(r.display_name, ''::text), r.id::text) AS display_name,
    r.country_code,
    COALESCE(r.role::text, '—'::text) AS role,
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
    r.birth_date,
    r.market_value,
    r.salary,
    r.contract_expires_season,
    r.availability_status,
    r.fatigue,
    r.image_url,
    c.id AS club_id,
    club_current_display_name_v1(c.id, c.name) AS club_name,
    c.country_code AS club_country_code,
    c.club_tier::text AS club_tier,
    c.is_ai AS club_is_ai,
    c.is_active AS club_is_active,
    COALESCE(v.points, 0::numeric) AS international_points,
    COALESCE(v.points, 0::numeric) AS season_points_overall,
    COALESCE(v.stage_finish_points, 0::numeric) AS season_points_sprint,
    COALESCE(v.final_gc_points, 0::numeric) + COALESCE(v.oneday_finish_points, 0::numeric) + COALESCE(v.leader_day_points, 0::numeric) AS season_points_climbing,
    COALESCE(v.podiums, 0) AS podiums,
    COALESCE(v.jerseys, 0) AS jerseys,
    COALESCE(v.stage_wins, 0) AS stage_wins,
    COALESCE(v.final_jerseys, 0) AS final_jerseys,
    COALESCE(v.oneday_finish_points, 0::numeric) AS oneday_finish_points,
    COALESCE(v.stage_finish_points, 0::numeric) AS stage_finish_points,
    COALESCE(v.leader_day_points, 0::numeric) AS leader_day_points,
    COALESCE(v.final_gc_points, 0::numeric) AS final_gc_points
   FROM riders r
     CROSS JOIN current_season cs
     LEFT JOIN rider_season_overview_v1 v ON v.rider_id = r.id AND v.season_year = cs.season_year
     LEFT JOIN current_rider_club crc ON crc.rider_id = r.id
     LEFT JOIN clubs c ON c.id = crc.club_id
  ORDER BY (COALESCE(v.points, 0::numeric)) DESC, r.id;;

create or replace view public.race_engine_paid_orphan_prize_reversal_plan_rows_v1 as  WITH tx AS (
         SELECT f.race_id,
            f.race_name,
            f.race_category,
            f.stage_id,
            f.stage_number,
            f.stage_date,
            f.stage_format,
            f.transaction_id,
            f.transaction_type,
            f.created_at,
            f.created_by,
            f.idempotency_key,
            f.metadata_stage_id,
            f.metadata_race_prize_award_id,
            f.metadata_source_transaction_id,
            f.metadata_race_id,
            f.metadata_club_id,
            f.metadata_payment_club_id,
            f.metadata_participating_club_id,
            f.metadata_rider_id,
            f.metadata_team_name,
            f.metadata_rider_name,
            f.metadata_bucket_key,
            f.metadata_source_type,
            f.metadata_source,
            f.metadata_amount,
            f.metadata_gross_amount,
            f.metadata_tax_amount,
            f.metadata,
            f.transaction_json,
            COALESCE(NULLIF(f.metadata_payment_club_id, ''::text)::uuid, NULLIF(f.metadata_club_id, ''::text)::uuid, NULLIF(f.metadata_participating_club_id, ''::text)::uuid) AS correction_club_id,
            COALESCE(NULLIF(f.metadata_race_prize_award_id, ''::text), f.transaction_id::text) AS source_award_or_transaction_ref
           FROM race_engine_paid_orphan_prize_finance_transactions_v1 f
        ), planned AS (
         SELECT tx.race_id,
            tx.race_name,
            tx.race_category,
            tx.stage_id,
            tx.stage_number,
            tx.stage_date,
            tx.stage_format,
            tx.transaction_id AS source_transaction_id,
            tx.transaction_type AS source_transaction_type,
            tx.metadata_race_prize_award_id AS race_prize_award_id,
            tx.metadata_source_transaction_id AS source_tax_parent_transaction_id,
            tx.correction_club_id,
            tx.metadata_team_name AS team_name,
            tx.metadata_rider_name AS rider_name,
                CASE
                    WHEN tx.transaction_type = 'race_prize'::text THEN 'reverse_race_prize_credit'::text
                    WHEN tx.transaction_type = 'tax_withholding'::text THEN 'reverse_tax_withholding_debit'::text
                    ELSE 'unsupported_transaction_type'::text
                END AS planned_operation_type,
                CASE
                    WHEN tx.transaction_type = 'race_prize'::text THEN 'public.finance_spend_from_club'::text
                    WHEN tx.transaction_type = 'tax_withholding'::text THEN 'public.finance_credit_to_club'::text
                    ELSE NULL::text
                END AS planned_function_candidate,
                CASE
                    WHEN tx.transaction_type = 'race_prize'::text THEN tx.metadata_amount
                    WHEN tx.transaction_type = 'tax_withholding'::text THEN tx.metadata_tax_amount
                    ELSE 0::numeric
                END AS planned_amount,
            'race_reset_reversal'::text AS planned_finance_type,
                CASE
                    WHEN tx.transaction_type = 'race_prize'::text THEN 'TREASURY'::text
                    WHEN tx.transaction_type = 'tax_withholding'::text THEN 'TAX_AUTHORITY'::text
                    ELSE NULL::text
                END AS planned_source_or_sink_code,
                CASE
                    WHEN tx.transaction_type = 'race_prize'::text THEN 'orphan-race-prize-reversal:'::text || tx.transaction_id::text
                    WHEN tx.transaction_type = 'tax_withholding'::text THEN 'orphan-tax-withholding-reversal:'::text || tx.transaction_id::text
                    ELSE 'unsupported:'::text || tx.transaction_id::text
                END AS planned_idempotency_key,
            jsonb_build_object('source', 'race_engine_paid_orphan_prize_reversal_plan_v1', 'reason', 'Guatemala Stage 5 paid orphan prize correction plan', 'correction_transaction_type', 'race_reset_reversal', 'planned_account_code',
                CASE
                    WHEN tx.transaction_type = 'race_prize'::text THEN 'TREASURY'::text
                    WHEN tx.transaction_type = 'tax_withholding'::text THEN 'TAX_AUTHORITY'::text
                    ELSE NULL::text
                END, 'original_transaction_id', tx.transaction_id, 'original_transaction_type', tx.transaction_type, 'original_race_prize_award_id', tx.metadata_race_prize_award_id, 'original_source_transaction_id', tx.metadata_source_transaction_id, 'race_id', tx.race_id, 'stage_id', tx.stage_id, 'stage_number', tx.stage_number, 'race_name', tx.race_name, 'team_name', tx.metadata_team_name, 'rider_name', tx.metadata_rider_name, 'bucket_key', tx.metadata_bucket_key, 'source_type', tx.metadata_source_type, 'original_metadata', tx.metadata) AS planned_metadata,
                CASE
                    WHEN tx.correction_club_id IS NULL THEN false
                    WHEN tx.transaction_type = 'race_prize'::text AND tx.metadata_amount <= 0::numeric THEN false
                    WHEN tx.transaction_type = 'tax_withholding'::text AND tx.metadata_tax_amount <= 0::numeric THEN false
                    WHEN tx.transaction_type <> ALL (ARRAY['race_prize'::text, 'tax_withholding'::text]) THEN false
                    ELSE true
                END AS planned_row_is_safe_shape,
                CASE
                    WHEN tx.correction_club_id IS NULL THEN 'blocked_missing_club_id'::text
                    WHEN tx.transaction_type = 'race_prize'::text AND tx.metadata_amount <= 0::numeric THEN 'blocked_missing_or_zero_race_prize_amount'::text
                    WHEN tx.transaction_type = 'tax_withholding'::text AND tx.metadata_tax_amount <= 0::numeric THEN 'blocked_missing_or_zero_tax_amount'::text
                    WHEN tx.transaction_type <> ALL (ARRAY['race_prize'::text, 'tax_withholding'::text]) THEN 'blocked_unsupported_transaction_type'::text
                    ELSE 'dry_run_reversal_row_ok'::text
                END AS planned_row_status
           FROM tx
        )
 SELECT race_id,
    race_name,
    race_category,
    stage_id,
    stage_number,
    stage_date,
    stage_format,
    source_transaction_id,
    source_transaction_type,
    race_prize_award_id,
    source_tax_parent_transaction_id,
    correction_club_id,
    team_name,
    rider_name,
    planned_operation_type,
    planned_function_candidate,
    planned_amount,
    planned_finance_type,
    planned_source_or_sink_code,
    planned_idempotency_key,
    planned_metadata,
    planned_row_is_safe_shape,
    planned_row_status
   FROM planned;;

create or replace view public.race_engine_paid_orphan_prize_reversal_plan_summary_v1 as  SELECT race_id,
    race_name,
    race_category,
    stage_id,
    stage_number,
    count(*) AS planned_reversal_rows,
    count(*) FILTER (WHERE source_transaction_type = 'race_prize'::text) AS race_prize_reversal_rows,
    count(*) FILTER (WHERE source_transaction_type = 'tax_withholding'::text) AS tax_withholding_reversal_rows,
    sum(planned_amount) FILTER (WHERE source_transaction_type = 'race_prize'::text) AS gross_prize_to_remove_from_clubs,
    sum(planned_amount) FILTER (WHERE source_transaction_type = 'tax_withholding'::text) AS tax_to_refund_to_clubs,
    COALESCE(sum(planned_amount) FILTER (WHERE source_transaction_type = 'race_prize'::text), 0::numeric) - COALESCE(sum(planned_amount) FILTER (WHERE source_transaction_type = 'tax_withholding'::text), 0::numeric) AS net_balance_reduction_after_tax_refund,
    bool_and(planned_row_is_safe_shape) AS all_rows_safe_shape,
    count(*) FILTER (WHERE planned_row_is_safe_shape = false) AS blocked_plan_rows,
    jsonb_agg(jsonb_build_object('source_transaction_id', source_transaction_id, 'source_transaction_type', source_transaction_type, 'race_prize_award_id', race_prize_award_id, 'correction_club_id', correction_club_id, 'team_name', team_name, 'rider_name', rider_name, 'planned_operation_type', planned_operation_type, 'planned_function_candidate', planned_function_candidate, 'planned_amount', planned_amount, 'planned_finance_type', planned_finance_type, 'planned_source_or_sink_code', planned_source_or_sink_code, 'planned_idempotency_key', planned_idempotency_key, 'planned_row_status', planned_row_status) ORDER BY source_transaction_type, race_prize_award_id, source_transaction_id) AS planned_rows_json,
        CASE
            WHEN bool_and(planned_row_is_safe_shape) = true THEN 'dry_run_plan_ok_no_changes_made'::text
            ELSE 'dry_run_plan_blocked_review_required'::text
        END AS plan_status,
    'No finance changes made. Plan uses transaction type race_reset_reversal, prize sink TREASURY, and tax source TAX_AUTHORITY.'::text AS recommendation
   FROM race_engine_paid_orphan_prize_reversal_plan_rows_v1
  GROUP BY race_id, race_name, race_category, stage_id, stage_number;;
