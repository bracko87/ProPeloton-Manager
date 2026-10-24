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

## Corrective release — Breakaway V1 opening physics and replay (2026-10-24)

### Root-cause findings from the completed production pilot records
Both Bačka and Binche **did** execute `experimental_breakaway_v1` at source `decf613ae309ee9f1216c2085a4f69deab255260`. Their recorded opening breaks reached only seven seconds, were caught around km 10.4–10.5 and the raw replays were degraded (six Bačka issues, two Binche issues). These already-published historical results are unchanged.

Live evidence showed a systematic opening-pursuit misclassification: `control_tempo` produced `race_control` behaviour for 24 riders across 14 Bačka teams and 32 riders across 19 Binche teams. The specialist's Phase 1 solver previously counted `race_control` as an explicit breakaway chase, producing an almost fully organized early pursuit when the teams were controlling pace rather than selecting `chase_breakaway`.

The specialist's accepted opening-attack list also retained second-wave attacks at kilometres after the original B1 escape had already been physically caught. This could create replay lineage and `successful_attack_without_physical_group` inconsistencies.

### Fix (only the specialist engine)
- Phase 1 organized chase coalitions now require **explicit `chase` behaviour**, not generic `race_control`. Peloton tempo still affects the underlying physical speed; it is not counted as active breakaway pursuit. Explicit pursuits retain their stronger response.
- When an opening B1 group is caught, later successful attack rolls cannot be marked as physically accepted members of that already-dissolved B1 group. The physical event contract and replay use the filtered accepted list; no time gaps or race results are injected.
- Official Breakaway V1 worker paths now fail closed if the raw replay is unsynchronized or the Phase 7/8 acceptance fails. They must not publish results by silently upgrading degraded replay to a passing state. Baseline and Mountain engines are unchanged.

### Validation and release provenance
- Corrected and tested solver source: `e9cf5541f1cd83618266eaaa44a355b921222161`.
- Validated main release (worker pins and fail-closed checks): `66bf56669d1036ab798cb1abdc386cfe5186eac8`.
- GitHub Actions final run: https://github.com/bracko87/ProPeloton-Manager/actions/runs/40073933122 — passed all steps, including 557/557 legacy tests and the specialist/worker routing regression gates.
- Controlled synthetic 96-rider comparison, same race seed and riders: control-tempo maximum physical gap **45.046535 seconds**, physical catch at **km 30.668782**; explicit breakaway pursuit maximum gap **7.093516 seconds**, physical catch at **km 11.434259**. Both completed without replay inconsistencies in their full-race tests.
- Read-only full engine canaries for both Bačka and Binche returned completion, Phase 9 and Phase 7/8 acceptance and synchronized replay, without database writes.

Supabase read-back verified deployment to project `okuravitxocyevkexfgi`:
- `universal-race-stage-runner` v45 — `355014ab40b7bd5acfd89d15eb5ddf1432e5dd513dfd9002504fba440fd39a7d`.
- `universal-race-stage-pass2-resume` v63 — `b9afdf82f9612e02bfa5239dcec1bdd049cd05994af014519300f49feac818fb`.
- `universal-race-stage-safe-resume` v68 — `dacdd6e282f16690938bac535001edef5474a068c6521686a7c844d599799c2d`.
- `breakaway-full-engine-canary` v4 — `5c4b032a4713a03390f4748d75b4e99e1d9468ece635bf035b25769ef1cf2781`.
- Existing Pass 1 input-preparation worker remains v43, unchanged.

**Production-usage qualification:** These fixes passed synthetic/replay regression tests and are available in the deployed workers. They have **not yet been exercised by a new official race**: the two nominated pilots already finished on the previous source. Their historical submission provenance remains pinned to `decf613ae309ee9f1216c2085a4f69deab255260` in the database to protect already-published results. Before nominating a future new official pilot, approve its exact stage ID, update the authoritative stage allowlist and matching database fail-closed submission rule, and confirm the corrected commit is pinned on every worker. Do not activate an unapproved candidate automatically.

## Third production pilot activation — Tacx Zeeland Classic, 12 October 2000 game time

On 2026-10-24 the owner explicitly approved the next Breakaway V1 candidate. **Only the exact official stage** `7f69e552-b116-453c-bf55-16ef655ea021` — Tacx Zeeland Classic / Ronde van Zeeland — has been added to the experimental release gate.

- Race starts game-time **2000-10-12 13:30**, on a **204.6 km flat road stage**, 360 m elevation gain, 96% flat / 4% hilly. Race has a registered **120 riders from 20 teams** and had no calculation or published result during activation.
- `breakawayOpportunityEngineV1.ts` has the stage-specific research entry (flat, escape opportunity 0.72), and `breakawayOfficialPilotV1.ts` explicitly authorizes its full sporting Breakaway V1 engine. Danube / Fruška Gora Finale remains excluded from the official release selector.
- Immutable solver import pin for Tacx and future test executions: `e00c4e694c0629efa5b06497dd514b505b166934`. It includes the previously corrected tempo-vs-explicit-chase physics and post-catch replay lineage fix.
- Full GitHub Actions validation https://github.com/bracko87/ProPeloton-Manager/actions/runs/40076224067 passed all 23 steps including 557/557 universal race-engine tests, the full synthetic 120-rider, 20-team, Zeeland-route simulation, builds, and stage routing gates. In the new 120-rider synthetic input the opening attackers did not establish a breakaway, so this verifies full execution/replay but **does not** pre-prove the sporting success of an escape in this stage. The independent 96-rider tempo-vs-chase regression continues to prove the corrected physical separation behavior.
- Read-only live canary `?stage=zeeland` returned `status=ok`, `engine_lane=experimental_breakaway_v1`, source pin `e00c4e...`, complete finish, synchronized replay, Phase 9 and Phase 7/8 acceptance, and zero DB writes. Historical Bačka and Binche canaries also passed.
- Production Edge deployment verified by live read-back:
  - `universal-race-stage-runner` v46 / `9a8cf62c2bb8b9abdce59825fbb0cfa7aea63358324963d64348b195e522657f`
  - `universal-race-stage-pass2-resume` v64 / `f5d0d27337545e2eefb23e787f1c88769281c4aeba0d3c5d98ee57ed046306c5`
  - `universal-race-stage-safe-resume` v69 / `881b5afe62bce09ed135b066fb7fbaa284be5ae4b5cdc2b0c5b7524a1f220db6`
  - `breakaway-full-engine-canary` v5 / `ac09b403d511974c3281ca27b2dfb7b67e12e91d0c4ab7944fb62b1679e11f32`
- All three live execution workers retain their previous accepted baseline source and strictly refuse sporting fallback or unsynchronized replay for exact Breakaway V1 pilot IDs. Pass 1 remains unchanged in production (input builder).
- Database RPC `public.universal_race_stage_submit_calculation_v1` has a **separate Tacx-specific fail-closed provenance guard** requiring `experimental_breakaway_v1`, source `e00c4e...`, no fallback, and no explicitly degraded/raw-unsynchronized replay. Probes verified 6 invalid provenance/replay inputs rejected and 2 correct inputs advanced to the expected missing-dummy-run check.
- The **existing historical** Bačka and Binche DB guard still expects their original `decf613...` production source. Read-only probes established that old publication provenance passes its contract and the new commit cannot retroactively overwrite old race results. Neither historical official result was modified.
- **Official result pending.** The third race must execute on its in-game schedule before the real-world production outcome (escape gap/lineage/replay/results) can be established. No production simulation was manually triggered.
