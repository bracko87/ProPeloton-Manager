-- Phase 11A read-only verification after one server calculation.
-- No writes. Reports the newest Phase 11A-compatible universal run.

with latest_run as (
  select run.*
  from public.race_stage_simulation_runs run
  where run.engine_version = 'ppm_universal_race_v1'
    and run.simulation_mode = 'universal_precalculated_replay_v1'
    and run.result_summary_json #>> '{calculation_contract}' = 'universal_phase11a_calculated_hidden_v1'
  order by run.updated_at desc, run.id desc
  limit 1
), manifest as (
  select
    run.*,
    run.result_summary_json #> '{application_manifest}' as application_manifest,
    run.result_summary_json #> '{output_snapshot,universalResult}' as universal_result,
    run.result_summary_json #> '{output_snapshot,publication,stageResults}' as stage_results,
    run.result_summary_json #> '{output_snapshot,publication,pointResults}' as point_results,
    run.result_summary_json #> '{output_snapshot,publication,reportEvents}' as report_events
  from latest_run run
)
select
  id as simulation_run_id,
  race_id,
  stage_id,
  status as database_run_status,
  result_summary_json #>> '{output_snapshot,contractVersion}' as output_contract,
  result_summary_json #>> '{output_snapshot,engineKey}' as engine_key,
  result_summary_json #>> '{output_snapshot,engineVersion}' as engine_version,
  result_summary_json #>> '{application_manifest,contractVersion}' as manifest_contract,
  coalesce((result_summary_json #>> '{application_manifest,readyForApplication}')::boolean, false) as manifest_ready,
  coalesce((result_summary_json #>> '{application_manifest,persistenceApplied}')::boolean, true) as persistence_applied,
  coalesce((result_summary_json #>> '{official_outputs_persisted}')::boolean, true) as official_outputs_persisted,
  coalesce((result_summary_json #>> '{results_published}')::boolean, true) as results_published,
  jsonb_array_length(coalesce(stage_results, '[]'::jsonb)) as staged_result_count,
  jsonb_array_length(coalesce(application_manifest #> '{riderStateRows}', '[]'::jsonb)) as rider_state_count,
  jsonb_array_length(coalesce(application_manifest #> '{fatiguePersistenceRows}', '[]'::jsonb)) as fatigue_row_count,
  jsonb_array_length(coalesce(application_manifest #> '{phase9ResourceUpdates}', '[]'::jsonb)) as phase9_resource_update_count,
  jsonb_array_length(coalesce(application_manifest #> '{healthCaseCandidates}', '[]'::jsonb)) as health_candidate_count
from manifest;

-- During Phase 11A verification these MUST remain zero for the selected run/stage.
with latest_run as (
  select run.*
  from public.race_stage_simulation_runs run
  where run.engine_version = 'ppm_universal_race_v1'
    and run.simulation_mode = 'universal_precalculated_replay_v1'
    and run.result_summary_json #>> '{calculation_contract}' = 'universal_phase11a_calculated_hidden_v1'
  order by run.updated_at desc, run.id desc
  limit 1
)
select
  run.id as simulation_run_id,
  run.stage_id,
  (select count(*) from public.race_stage_results r where r.simulation_run_id = run.id) as official_result_rows_for_run,
  (select count(*) from public.race_stage_point_results p where p.stage_id = run.stage_id) as official_point_rows_for_stage,
  (select count(*) from public.race_stage_report_events e where e.stage_id = run.stage_id) as official_report_rows_for_stage
from latest_run run;

-- Verify the public replay RPC exposes exactly the stored result only when open.
with latest_run as (
  select run.stage_id
  from public.race_stage_simulation_runs run
  where run.engine_version = 'ppm_universal_race_v1'
    and run.simulation_mode = 'universal_precalculated_replay_v1'
    and run.result_summary_json #>> '{calculation_contract}' = 'universal_phase11a_calculated_hidden_v1'
  order by run.updated_at desc, run.id desc
  limit 1
)
select public.get_universal_race_stage_replay_payload_v1(stage_id) as replay_payload
from latest_run;
