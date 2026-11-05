-- V4 RESEARCH ONLY: private SQL Editor / trusted administrator connector.
-- Replace exactly one __STAGE_ID_UUID__ placeholder with a validated UUID.
-- No login/password for research role, no production payload RPC, no writes.
-- IMPORTANT: Capture result may contain private rider/team records when eligible.
-- Never post the eligible result to GitHub, logs, chat or an unsecured location.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL ROLE v4_live_shadow_read_login;
WITH stage_source AS (
 SELECT s.*,
   (s.stage_date::timestamp + make_interval(
     hours=>s.planned_start_hour_number,
     mins=>coalesce(s.planned_start_minute,0))) AT TIME ZONE 'UTC'
       AS verified_start_game_ts
 FROM public.race_stages s
 WHERE s.id='__STAGE_ID_UUID__'::uuid
),
game_now AS (
 SELECT make_timestamptz(1999+g.season_number,g.month_number,g.day_number,
   coalesce(g.hour_number,0),coalesce(g.minute_number,0),0,'UTC') AS ts
 FROM public.game_state g WHERE g.id=true
),
eligibility AS (
 SELECT s.id,s.race_id,s.stage_number,s.verified_start_game_ts,
   s.verified_start_game_ts-interval '3 hours' AS cutoff_game_ts,
   g.ts AS snapshot_game_ts,
   (SELECT count(*) FROM public.race_stage_plans p WHERE p.stage_id=s.id) AS plan_count,
   (SELECT count(*) FROM public.race_stage_plans p WHERE p.stage_id=s.id AND
      p.status='locked' AND p.locked_at IS NOT NULL AND
      p.engine_stage_payload_json->>'immutable'='true' AND
      p.engine_stage_payload_json->>'snapshot_hash'=
        p.metadata->>'engine_stage_payload_snapshot_hash') AS valid_locked_count,
   (SELECT count(*) FROM public.race_participant_teams_v1 t
    WHERE t.race_id=s.race_id AND
      lower(coalesce(t.status,'accepted'))='accepted') AS accepted_team_count,
   (SELECT count(*) FROM public.race_participant_riders_v1 r
    WHERE r.race_id=s.race_id) AS participant_rider_count,
   (SELECT count(*) FROM public.race_team_stage_disqualifications d
    WHERE d.race_id=s.race_id AND d.from_stage_number<=s.stage_number) AS disqualification_count,
   (current_user='v4_live_shadow_read_login' AND
    session_user='postgres' AND
    current_setting('transaction_read_only')='on') AS role_verified,
   (s.stage_format='road_race' AND
    s.terrain_type IN ('flat','hilly','mountain','cobbled') AND
    s.planned_start_hour_number BETWEEN 0 AND 23 AND
    coalesce(s.planned_start_minute,0) BETWEEN 0 AND 59) AS supported
 FROM stage_source s CROSS JOIN game_now g
),
eligible AS (
 SELECT e.*,
   (e.role_verified AND e.supported AND e.plan_count>0 AND
    e.valid_locked_count=e.plan_count AND
    e.accepted_team_count>=2 AND e.participant_rider_count>=2 AND
    e.disqualification_count=0 AND
    e.snapshot_game_ts>=e.cutoff_game_ts AND
    e.snapshot_game_ts<e.cutoff_game_ts+interval '5 minutes' AND
    e.snapshot_game_ts<e.verified_start_game_ts) AS approved
 FROM eligibility e
)
SELECT jsonb_build_object(
 'contract','ppm.v4.admin-readonly-sql-export.v1',
 'status',CASE WHEN e.approved
    THEN 'V4_LOCKED_RESEARCH_SOURCE_EXPORTED'
    ELSE 'V4_LOCKED_RESEARCH_SOURCE_NOT_ELIGIBLE' END,
 'reader','v4_live_shadow_read_login',
 'transaction_read_only',current_setting('transaction_read_only'),
 'counts',jsonb_build_object(
   'plan_rows',e.plan_count,'locked_valid_rows',e.valid_locked_count,
   'accepted_teams',e.accepted_team_count,
   'participant_riders',e.participant_rider_count,
   'disqualifications',e.disqualification_count),
 'bundle',CASE WHEN e.approved THEN
 jsonb_build_object(
   'sourceKind','read_only_lock_window_capture',
   'activeRole',current_user,
   'authenticatedRole',session_user,
   'transactionReadOnly',current_setting('transaction_read_only'),
   'gameNow',e.snapshot_game_ts,
   'stageStartGameTs',e.verified_start_game_ts,
   'lockCutoffGameTs',e.cutoff_game_ts,
   'sources',jsonb_build_object(
     'stage',to_jsonb(s)-'verified_start_game_ts',
     'race',(SELECT to_jsonb(r) FROM public.races r WHERE r.id=e.race_id),
     'profile',public.get_race_stage_profile_detail_v1(e.id),
     'stagePoints',(SELECT coalesce(jsonb_agg(to_jsonb(x)
        ORDER BY x.sort_order,x.km_from_start,x.id),'[]'::jsonb)
       FROM public.race_stage_points x WHERE x.stage_id=e.id),
     'participantTeams',(SELECT coalesce(jsonb_agg(to_jsonb(x)
        ORDER BY x.race_team_entry_id),'[]'::jsonb)
       FROM public.race_participant_teams_v1 x
       WHERE x.race_id=e.race_id AND
        lower(coalesce(x.status,'accepted'))='accepted'),
     'participantRiders',(SELECT coalesce(jsonb_agg(to_jsonb(x)
        ORDER BY x.start_number NULLS LAST,x.rider_id),'[]'::jsonb)
       FROM public.race_participant_riders_v1 x WHERE x.race_id=e.race_id),
     'riderInputRows',(SELECT coalesce(jsonb_agg(to_jsonb(x)
        ORDER BY x.team_id,x.rider_id),'[]'::jsonb)
       FROM public.race_engine_get_stage_rider_inputs_v1(e.id) x),
     'phaseCommandRows',(SELECT coalesce(jsonb_agg(to_jsonb(x)
        ORDER BY x.team_id,x.rider_id),'[]'::jsonb)
       FROM public.race_engine_get_stage_phase_commands_v1(e.id) x),
     'lockedPlanRows',(SELECT coalesce(jsonb_agg(
        to_jsonb(p)||jsonb_build_object(
          'team_id',coalesce(rp.participating_club_id,rp.club_id),
          'club_id',rp.club_id,
          'participating_club_id',rp.participating_club_id)
        ORDER BY p.id),'[]'::jsonb)
       FROM public.race_stage_plans p
       JOIN public.race_preparations rp ON rp.id=p.race_preparation_id
       WHERE p.stage_id=e.id),
     'phase9Payload',public.universal_race_stage_filter_phase9_eligible_v1(
       e.id,public.race_engine_get_stage_phase9_inputs_v1(e.id)),
     'preStageLeaders',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
       FROM public.get_race_stage_pre_stage_leaders_v1(e.id) x),
     'preStageStandings',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
       FROM public.get_race_stage_pre_stage_standings_v1(e.id) x)
   )
 ) ELSE NULL END
) AS capture_result
FROM eligible e JOIN stage_source s ON s.id=e.id;
ROLLBACK;
