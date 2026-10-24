-- Administrator-only, read-only stage-scoped mountain engine audit.
-- Mirrors the approved pilot IDs and primary source commit of the verified 2026-10-23 live four-worker release.
-- No official sporting results are mutated; the view deliberately does not claim a successful worker preflight.
CREATE OR REPLACE VIEW public.race_engine_mountain_pilot_audit_v1
WITH (security_invoker = true) AS
WITH pilot(stage_id, expected_lane, approved_source_sha) AS (
  VALUES
    ('9c329adc-ccbf-45cf-8b5f-5b07604b341a'::uuid, 'experimental_mountain_v1'::text, '878aa8ae0db95d97fa5385513d2c1394e3a791a2'::text),
    ('0885f370-5082-4bbe-994f-3938f00b7b11'::uuid, 'experimental_mountain_v1'::text, '878aa8ae0db95d97fa5385513d2c1394e3a791a2'::text),
    ('e00c9ead-91fd-41ce-95f0-de3e4d241e16'::uuid, 'experimental_mountain_v1'::text, '726682eaf58385c4d60a9b664d2b9696b8cfc1a0'::text),
    ('dd6681d1-e565-43f3-8449-0bb203b0eb07'::uuid, 'experimental_mountain_v1'::text, '726682eaf58385c4d60a9b664d2b9696b8cfc1a0'::text),
    ('a448f8a2-7c9a-426f-8482-d098de506bdb'::uuid, 'experimental_mountain_v1'::text, '726682eaf58385c4d60a9b664d2b9696b8cfc1a0'::text),
    ('1f651095-bea0-4e3b-a0f5-d45c9159de92'::uuid, 'experimental_mountain_v1'::text, '726682eaf58385c4d60a9b664d2b9696b8cfc1a0'::text),
    ('17a68003-e433-4927-ab0b-c62c57aebc7b'::uuid, 'experimental_mountain_v1'::text, '726682eaf58385c4d60a9b664d2b9696b8cfc1a0'::text),
    ('fbe8548d-19c6-4c1b-a8cb-dc8e2bf52dc9'::uuid, 'experimental_mountain_v1'::text, '726682eaf58385c4d60a9b664d2b9696b8cfc1a0'::text),
    ('8a320efa-36af-40ab-b106-0af6e4a9ff31'::uuid, 'experimental_mountain_v1'::text, '726682eaf58385c4d60a9b664d2b9696b8cfc1a0'::text),
    ('eb74b4c3-1930-4c90-9092-1cd964c138aa'::uuid, 'experimental_mountain_v1'::text, '726682eaf58385c4d60a9b664d2b9696b8cfc1a0'::text)
),
evidence AS (
  SELECT p.stage_id, p.expected_lane, p.approved_source_sha,
    s.race_id, s.name AS stage_name, s.stage_date, s.stage_format, s.terrain_type,
    r.id AS simulation_run_id, r.status AS simulation_status,
    r.engine_version AS engine_runtime_version,
    r.result_summary_json #>> '{output_snapshot,verification,engineLaneV1}' AS actual_lane,
    r.result_summary_json #>> '{output_snapshot,verification,primarySourceCommit}' AS actual_source_sha,
    r.result_summary_json #>> '{output_snapshot,verification,replayQuality}' AS replay_quality,
    r.result_summary_json #>> '{output_snapshot,verification,rawReplaySynchronized}' AS raw_replay_synchronized
  FROM pilot p
  LEFT JOIN public.race_stages s ON s.id = p.stage_id
  LEFT JOIN LATERAL (
    SELECT sr.id, sr.status, sr.engine_version, sr.result_summary_json
    FROM public.race_stage_simulation_runs sr
    WHERE sr.stage_id = p.stage_id
    ORDER BY sr.created_at DESC, sr.id DESC
    LIMIT 1
  ) r ON true
)
SELECT evidence.*,
  CASE
    WHEN race_id IS NULL THEN 'blocked_stage_missing'
    WHEN stage_format IS DISTINCT FROM 'road_race' OR terrain_type IS DISTINCT FROM 'mountain'
      THEN 'blocked_stage_ineligible'
    WHEN simulation_run_id IS NULL THEN 'preflight_needs_live_worker_readback'
    WHEN simulation_status IS DISTINCT FROM 'completed' THEN 'execution_not_complete'
    WHEN actual_lane IS DISTINCT FROM expected_lane THEN 'failed_engine_lane_mismatch'
    WHEN actual_source_sha IS DISTINCT FROM approved_source_sha THEN 'failed_source_commit_mismatch'
    WHEN replay_quality IS DISTINCT FROM 'full' THEN 'warning_replay_degraded'
    WHEN raw_replay_synchronized = 'false' THEN 'warning_raw_replay_unsynchronized'
    ELSE 'passed_execution_and_replay'
  END AS verification_status
FROM evidence;
REVOKE ALL ON public.race_engine_mountain_pilot_audit_v1 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.race_engine_mountain_pilot_audit_v1 TO service_role;
