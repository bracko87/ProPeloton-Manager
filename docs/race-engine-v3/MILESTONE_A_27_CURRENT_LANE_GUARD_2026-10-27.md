# Race Engine V3 — A2 Step 27: current-lane-first admission across true lateral starting grids

**27 October 2026 — 5,280/5,280 research micro simulations technically PASS; sporting NO-GO. No live race engine, race data or game clock changes.**

## Objective and three candidate policies

[A26](MILESTONE_A_26_LANE_ROUNDING_ROOT_CAUSE_2026-10-27.md) showed the specific lane-0 failure: the adjacent-only selector tells a faster follower already travelling in free lane 0 to steer into the slower leader's occupied lane 1. Its 80 no-steering controls all passed physically and achieved sustained passing. The new research asks if automatically preferring the current lane can fix this without breaking other lateral start grids or competing-rider movements.

Three policies are compared on **exactly matched fixtures**:
1. **baseline**: the unchanged `a2IntentAwareCorridorV3.mjs` (always selects an adjacent passing corridor);
2. **current_lane_first**: new `a2CurrentLaneFirstV3.mjs` adapter, considering the existing lane on each tick if separated from the leader and if the currently submitted swept trajectories of nearby cyclists do not contest it; otherwise handing the request to the baseline planner;
3. **outer_lane_guard**: the same adapter, but eligible to favor the existing lane **only when the follower initially started in lane 0**, not after a rider happened to reach lane 0 later. All other cases use the original planner.

The new policy does **not** replace the swept bicycle collision solver or the finite W-prime model. It never changes a nonconsenting rider's submitted forward or lateral intention. Its conflict check is based only on current communicated intentions/positions; it cannot know a rival's next-tick decision. The baseline-wide candidate remains available as an explicit counterfactual but neither alternative is approved for gameplay.

### Code and verified build

- [Initial current-lane micro prototype](https://github.com/bracko87/ProPeloton-Manager/commit/3c024e9740c0bd5bd018056ccd0788a306cacc5f).
- [Full paired starting-grid runner](https://github.com/bracko87/ProPeloton-Manager/commit/6bd29505afcf5f2c6a3045b3951b19826d282798).
- [Fixed initial outer-lane eligibility](https://github.com/bracko87/ProPeloton-Manager/commit/11281834247ee25d0768d1512304912d006dd3da) after an earlier exploratory guard was found to apply in unrelated later lanes and regress.
- [Final three-policy full matrix and CI trigger](https://github.com/bracko87/ProPeloton-Manager/commit/5f96ac1162f236dcba90dbce53591eab0a1ed268).

[**Final GitHub Actions run: SUCCESS in all five rider-size jobs**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40523982048). Each job invokes the new guard's unit tests, the pre-existing 2D collision and full-stage *technical* regressions, and the two-, three-, four-, five-, or six-rider matrix. The two-rider job also independently builds the application. JSON artifacts `v3-a2-current-lane-compare-{2,3,4,5,6}` preserve per-case results for 30 days.

## Complete technical coverage

The **1,760 fixtures for each policy** are identical to the [corrected A26 starting-lane matrix](MILESTONE_A_26_LANE_ROUNDING_ROOT_CAUSE_2026-10-27.md). Each uses 40 × 10-second steps, four synthetic (not road-surveyed) widths/envelopes, initial headways of 9m or 18m, scripted trailing requests of 55m/75m, unchanged rider powers and additional cyclists' movements, and:
- **2 riders**: 80 configurations per policy.
- **3 riders**: 336 configurations per policy.
- **4, 5 and 6 riders**: 448 configurations per rider count per policy.

The tested lanes comprise original, rear starts in lane 0 or 2, leader starts in lane 0 or 2, and where applicable first rival starts in lane 1 or 3. Rival scripts include initially open, early entry, delayed entry and two moving claimants (for fields of at least 4 riders).

**All 5,280 runs passed** collision checks for every pair of accepted swept paths, finite/nonnegative W-prime, no invented forward distance, unchanged official-write counters and exact JSON tick-20 checkpoint/replay of physics, energy, pass observer and policy state. The **six-decimal test-fixture edge rounding guard** from A26 remains present and unaltered in all three arms; no physical collision envelope or production engine was changed.

## Results: full field, not only the successful lane-0 example

A "pass" here means a strict longitudinal ordering reversal held for **at least 60 synthetic seconds**. "Near-stopped" means moving under 0.5m during a ten-second tick. Aggregates are rider-ticks, not unique riders or actual seconds.

| Metric, across 1,760 matched fixtures each | Baseline adjacent-only | Broad current-lane-first | Initial-lane-0 guarded |
|---|---:|---:|---:|
| Technical validations | 1,760/1,760 | 1,760/1,760 | **1,760/1,760** |
| Sustained passes | 1,502 | 1,545 | **1,610** |
| Passing rider near-stopped ticks | 1,102 | **545** | 692 |
| Other riders near-stopped ticks | **974** | 1,038 | 1,025 |
| Main claimant completed desired final lane center | 1,232 | 1,232 | 1,232 |
| Second claimant completed final lane center | 336 | 336 | 336 |
| Stay-current-lane decisions (total rider-ticks) | 0 | 58,242 | 6,180 |
| Fallback-to-legacy decisions (total rider-ticks) | 0 | 12,158 | 64,220 |

The guarded variant nets **+108 sustained passes** over baseline, but causes **+51 unrelated near-stop ticks**. Therefore the higher overtake total is *not* a full sporting improvement on all metrics.

### Critical matched scenarios

| Scenario | Baseline | Broad policy | Initial-lane-0 guard |
|---|---:|---:|---:|
| Open road, rear starts lane 0 | **0/80** | **80/80** | **80/80** |
| Delayed rival entry, rear starts lane 0 | **0/64** | **64/64** | **64/64** |
| Early rival entry, original grid | **64/64** | 32/64 | **64/64** |
| Two rivals moving, original grid | **48/48** | 24/48 | **48/48** |
| Early rival entry, rear starts lane 0 | **64/64** | 56/64 | **52/64** |
| Two rivals moving, rear starts lane 0 | **48/48** | 24/48 | **24/48** |
| Two rivals moving, first rival starts lane 3 | 0/48 | 21/48 | 0/48 |

The guard successfully avoids the broad policy's 32 and 24 lost passes on the **original** early-blocker and two-claimant grids, respectively. However, it is still **worse than baseline** when the rear rider *starts* in lane 0 and a rival enters early (−12 passes), or when two rivals compete (−24 passes). In the early lane-0 scene, the guard generates **285 unrelated near-stop ticks**, compared with **zero** under baseline. Thus **sporting robustness has not passed**, even though both rivals' final requested lanes are reached in all relevant test cases.

## Engineering interpretation and next bounded gate

The root-cause fix is directionally correct: the requesting follower must be allowed to continue in its already-clear lateral corridor. The previously universal adjacent-lane demand was artificial. But **a lane clear to one rider now can become contested by two other cyclists later**; simply continuing straight or switching back to the old planner on the first conflicting current intent can create congestion and prevent a sustained pass.

**A2 remains sporting NO-GO.** Do not promote any of these policies to the canonical 106/168-rider stage solver, tactics, player interface or production.

**Next research gate:** run isolated *current-lane reservation and release* tests restricted to the **rear-starts-lane-0 early-entry and two-claimant counterexamples**, checking all participants' actual evolving spatial paths and the first conflicting movement. Compare (a) stay-current, (b) safe delayed release, and (c) explicitly negotiated crossing windows without overriding nonconsenting riders. Require equal or better completion and congestion relative to baseline across every initial-lane test before any larger 12/24/32-rider extrapolation. Retain nonlinear substep safety and authentic stage widths/elevation, fractional finish energy, breakaway/drafting and full-stage position stability as independent blockers.

**A1 technically complete. A2 OPEN / SPORTING NO-GO. Milestones B and C NOT STARTED. Official writes = 0.**
