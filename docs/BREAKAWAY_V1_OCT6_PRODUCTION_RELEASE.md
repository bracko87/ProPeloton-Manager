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
Binche is separately activated by the following controlled second release. Danube & Fruška Gora Finale remains shadow-only. No terrain-wide switch is authorized.

## Subsequent controlled release: Binche–Chimay–Binche, game-time 2000-10-07

Following explicit owner approval on 2026-10-23, **two** stage UUIDs are now mandatory Breakaway V1 pilots:
- Bačka Plains Opener (2000-10-06): `5523cf76-8fd4-4a12-ab28-7f285c9829ff`, flat, 139.2 km.
- Binche–Chimay–Binche / Mémorial Franco Vandenbroeck (2000-10-07): `335708f7-d56a-4816-9068-38399e8f74e3`, hilly, 203.2 km, 1710 m elevation gain.

Their immutable revised selected solver source is `decf613ae309ee9f1216c2085a4f69deab255260` (same Breakaway V1 physics, with Binche added to the authoritative selector). The previous `10dc6e7b7470f2c859a7019515a46708a5792024` source was the original Bačka-only release and is superseded as a production provenance pin.

Read-back verified Supabase production versions after this extension:
- `universal-race-stage-runner` v44; sha256 `9d6d357a30efede690516a47e5fe6c47cc9203a3f62347ffe38935c5a0c8c3ac`
- `universal-race-stage-pass2-resume` v62; sha256 `854b2079e438d22692dc58dbf0b123da3aba50f4535f4d01c2e7b6f89dc5712b`
- `universal-race-stage-safe-resume` v67; sha256 `13ae0703f966e712885183feb42ef7e2e6b1463d155760dc5d091ce6ca40c5b3`
- `breakaway-full-engine-canary` v3; sha256 `71fb36d9ddbb246c3782509adf205c15b110931b3fb3e2217cc9a818ed53823f`
- Pass 1 is an unchanged input-preparation worker. Legacy baseline and Mountain pilot source remains preserved in live production; these overlays change only Breakaway pilot routing.

The shared `public.universal_race_stage_submit_calculation_v1(uuid,uuid,jsonb,jsonb)` rejects *both* stage UUIDs if result verification does not specify `experimental_breakaway_v1`, source `decf613ae309ee9f1216c2085a4f69deab255260`, and absence of sporting fallback. Its exact-stage guard applies to normal and chunked Safe Resume submission. SQL tests checked eight invalid and four correct pilot provenance cases, plus no effect on Danube Finale.

Read-only live canary tests for both stage IDs passed, including Phase 9/Phase 7-8 contracts and synchronized replay. The complete 96-rider synthetic roster Binche hilly regression passed in GitHub Actions run 40030272445; no real stage or rider results were created or overwritten.

Danube and Fruška Gora Finale, `f5af8665-91c1-4585-937e-11fb94f65819` on 2000-10-08, remains **shadow-only**. No global terrain-wide change is authorized.
