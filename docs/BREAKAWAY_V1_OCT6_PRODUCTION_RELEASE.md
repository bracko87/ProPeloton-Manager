# Breakaway V1 — Bačka Plains Opener production assignment
Release audit: 2026-10-23

## Mandated stage and source
- Race: Trka kroz Vojvodinu — Bačka Plains Opener.
- Game date: 2000-10-06; planned start: 11:00 game time.
- Stage ID: `5523cf76-8fd4-4a12-ab28-7f285c9829ff`; format `road_race`; terrain `flat`; distance 139.20 km.
- Required engine lane: `experimental_breakaway_v1`.
- Immutable approved engine source: `10dc6e7b7470f2c859a7019515a46708a5792024`.
- This is an engine assignment, not a guarantee of breakaway victory or of error-free execution.

## Live Supabase production release (project `okuravitxocyevkexfgi`)
Verified by reading back deployed function source after deployment:
- `universal-race-stage-runner` v43, source bundle sha256 `93be93ad9a2a1448049f8c99a5b14c153db725d59cc9735631696f6231b546fd`. For Bačka only, the primary computation dispatches the approved Breakaway V1 core. If fallback is requested or the primary throws, the pilot cannot publish baseline fallback. Output verification contains the selected lane and approved source commit.
- `universal-race-stage-pass2-resume` v61, sha256 `5da3eb22f574294d2c562843f3426c5f6c35148554ba0c5fd796b81b8be8fdce`. The same pilot-specific routing and mandatory fallback rejection. Failure handling sends rejected attempts through the worker's existing failure RPC.
- `universal-race-stage-safe-resume` v66, sha256 `a036f674f93add0a0a92d54e6c8f7e40a00a9622e838c1fe04e5d081fac9f9ae`. The pilot stage uses the approved breakaway solver through all deterministic phases. The checkpoint preserves solver lane and source commit. Any pilot/baseline lane or resumed-source mismatch fails closed.
- `universal-race-stage-pass1-resume` v43 remains an unchanged input-preparation worker; it does not execute the final sporting solver.
- `breakaway-full-engine-canary` v2, sha256 `57502693574bcc14134c9c30125391281d79c2774fe2106ed1766efa0eb6b892`. A read-only synthetic full-race invocation returned lane `experimental_breakaway_v1`, full classification, replay synchronization, Phase 9 and Phase 7/8 acceptance, and no database writes.

The currently deployed production non-pilot workers retain their accepted legacy source pin `878aa8ae0db95d97fa5385513d2c1394e3a791a2`. The immutable pilot overlay imports `10dc6e7b7470f2c859a7019515a46708a5792024`. GitHub `main` has separately been updated to point candidate four-worker code at the reviewed source; do not claim that merely updating GitHub redeploys Supabase.

## Database-level fail-closed publication boundary
The existing function `public.universal_race_stage_submit_calculation_v1(uuid,uuid,jsonb,jsonb)` was updated **in place** to reject submissions for stage `5523cf76-8fd4-4a12-ab28-7f285c9829ff` unless the submitted `p_universal_result.verification` contains:
- `selectedEngineLaneV1 = experimental_breakaway_v1` (or the existing Safe Resume alias `engineLaneV1`)
- `primarySourceCommit = 10dc6e7b7470f2c859a7019515a46708a5792024`
- `fallbackUsed` is absent or false (never true)

This guard runs before any hidden-calculation persistence and also applies to Safe Resume's chunked output path, because `universal_race_stage_submit_chunked_calculation_v1` delegates to the same RPC. All other stages use their existing submission policy. The original submit function's SQL contract and accepted parameters remain unchanged.

Read-only/exceptions-caught SQL tests validated: invalid pilot provenance is rejected; valid pilot provenance proceeds to normal run-claim validation; a non-pilot stage is not rejected by the new rule.

## Monitoring and acceptance
Before game-time 6 October, verify all deployed versions/source hashes, clock/race scheduling, absence of a previously computed official run, and successful read-only canary. On race calculation, inspect the saved `race_stage_simulation_runs.result_summary_json.output_snapshot.verification`; it must report the expected lane and source. Check `results_published`, `calculation_status`, and replay synchronization; do not infer a valid run from scheduled status alone.

If the approved engine fails, the stage should be flagged/held rather than silently published by the universal baseline. This protects sporting integrity, but may delay results until a controlled intervention. Do not rewrite historical results.

## Follow-on stages
Binche–Chimay–Binche, game-time 2000-10-07, and Danube & Fruška Gora Finale, game-time 2000-10-08, remain **shadow-only** until explicitly approved for official routing. No all-hilly/flat switch was authorized.
