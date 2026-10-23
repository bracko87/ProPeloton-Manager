# Mountain pilot automatic verification — operational contract

Implemented 2026-10-23. The database view `public.race_engine_mountain_pilot_audit_v1` is **read-only and administrator-only** (SELECT for service_role; PUBLIC/anon/authenticated revoked). It never selects a race engine or modifies results.

## Current accepted mountain pilot scope
- Poyang Lakes Stage 7: `9c329adc-ccbf-45cf-8b5f-5b07604b341a` (completed).
- Valdengo–Oropa: `0885f370-5082-4bbe-994f-3938f00b7b11` (upcoming).
- Xingtai Stage 2 is **historical baseline evidence**, already completed before the pilot; do not mislabel it as an experimental execution.
- Montenegro Tour Stage 3 is **not approved** for this experimental lane and legitimately recorded `baseline_universal` with degraded replay. Do not rewrite it.

## Admin readout

In the ProPeloton Manager Supabase SQL Editor (admin/service role), run:

```sql
SELECT stage_id, stage_name, stage_date, stage_format, terrain_type,
       expected_lane, approved_source_sha, simulation_run_id, simulation_status,
       actual_lane, actual_source_sha, replay_quality, raw_replay_synchronized,
       verification_status
FROM public.race_engine_mountain_pilot_audit_v1
ORDER BY stage_date;
```

The view derives the **latest** run by stage and compares its saved `output_snapshot.verification.engineLaneV1`, `primarySourceCommit`, and `replayQuality` with the approved experimental lane and release SHA.

Possible status values:
- `preflight_needs_live_worker_readback`: stage eligible and no run yet, but **not** proof of live routing readiness.
- `blocked_stage_missing` or `blocked_stage_ineligible`: do not claim pilot eligibility.
- `execution_not_complete`: wait for the normal race lifecycle; do not manually trigger it.
- `failed_engine_lane_mismatch` or `failed_source_commit_mismatch`: investigate; **never** silently classify as a successful V2 run.
- `warning_replay_degraded` / `warning_raw_replay_unsynchronized`: results exist, but replay acceptance is incomplete.
- `passed_execution_and_replay`: the saved run reports the approved solver/source and full replay. This verifies runtime identity and replay quality, **not** sporting realism.

## Mandatory pre-race check

For every newly nominated stage, first confirm its exact UUID is approved in `src/universal-race-engine/mountainEnginePilotV1.ts` on the immutable **deployed** source commit. It must have `stage_format = road_race` and `terrain_type = mountain`.

Read back **all four** live Supabase functions (runner, pass1-resume, pass2-resume, safe-resume), not just GitHub source. Check the actual `SOURCE_COMMIT`, imports, stage selector, resume/checkpoint lane preservation, and fallback behavior. Confirm the source SHA used in the read-back matches the approval recorded in the audit view. Run the repo's routing/isolation tests before approving a rollout.

Important: As of the 2026-10-23 inspection, all four live workers are pinned to `878aa8ae0db95d97fa5385513d2c1394e3a791a2`, which includes the stage-scoped mountain dispatcher and the three-stage allowlist. GitHub `main` currently contains newer worker files pinned to `2d2c4290ecea56e5a66d89705c4e1655383da1b3`; **do not assume that editing or building main deploys Supabase Edge Functions**. Reconcile deployed versions after every controlled worker deployment and update the approved-SHA audit migration under review. Do not equate `race_engine_ts_v1` with the specialist lane; the authoritative identity is `engineLaneV1`.

## Automatic oversight

A recurring hourly ChatGPT verification watch has been created for the Valdengo–Oropa pilot. It requests live worker read-back and compares post-race database provenance and replay quality; it alerts on meaningful discrepancies or a newly verified result. This is observational and **does not block or trigger live race calculations**. The SQL view evaluates current stored status when queried; it does not itself send alerts or write audit records.

## Production safeguards / limitations

Do **not** use a `passed_execution_and_replay` status to assume all mountain behavior is realistic. Maintain physical-group and timing acceptance testing. Until a reviewed worker-side enforcement gate is released, the preflight remains a monitored check, not a hard execution block. Finished official results, GC, payouts and existing race workers must remain unchanged by this audit.
