-- PRIVATE RESEARCH EXPORT: run only through an existing trusted postgres
-- admin session. Requires zero new credentials; never paste real rider data
-- into GitHub, public logs or chat. Research snapshots are NOT official locks.
-- Replace __STAGE_ID_UUID__ with one validated UUID.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH checked AS (
 SELECT stage_id,race_id,stage_start_game_ts,lock_cutoff_game_ts,
  captured_game_ts,source_kind,source_sha256,source_payload,
  team_count,rider_count,
  encode(extensions.digest(convert_to(source_payload::text,'UTF8'),
   'sha256'),'hex')=source_sha256 AS hash_valid
 FROM private.v4_research_locked_full_stage_sources_v1
 WHERE stage_id='__STAGE_ID_UUID__'::uuid
  AND current_user='postgres' AND session_user='postgres'
  AND current_setting('transaction_read_only')='on'
)
SELECT jsonb_build_object(
 'contract','ppm.v4.private-sidecar-research-export.v1',
 'status',CASE WHEN hash_valid
   THEN 'V4_PRIVATE_RESEARCH_SIDECAR_EXPORTED'
   ELSE 'V4_PRIVATE_RESEARCH_SIDECAR_HASH_REJECTED' END,
 'researchOnly',true,
 'officialWrites',0,'productionParityVerified',false,
 'sourceKind',source_kind,
 'stageId',stage_id,'raceId',race_id,
 'stageStartGameTs',stage_start_game_ts,
 'lockCutoffGameTs',lock_cutoff_game_ts,
 'capturedGameTs',captured_game_ts,
 'sourceSha256',source_sha256,
 'teamCount',team_count,'riderCount',rider_count,
 -- Crucial: preserve PostgreSQL JSONB serialization byte-for-byte
 -- for independent Node SHA-256 validation against the database hash.
 'sourcePayloadText',CASE WHEN hash_valid
    THEN source_payload::text ELSE NULL END
) AS private_capture
FROM checked;
ROLLBACK;
