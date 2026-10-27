# Race Engine V3 — A2 nonlinear sub-tick sensitivity and actual starting-lane robustness

**27 October 2026 — NONLINEAR MICRO TEST PASS; LANE GRID SPORTING REGRESSION AND 69 TECHNICAL FAILURES. A2 SPORTING NO-GO.**

## Research boundary

This study extends [A24 sub-tick time ordering](MILESTONE_A_24_SUBTICK_ORDER_2026-10-27.md) in two independent offline-only ways:

1. Test whether the previous precisely classified crossing times and collision-free paths remain valid when intermediate acceleration or lateral steering is not affine.
2. Change the **actual initial lateral lanes** of the trailing cyclist, leading cyclist and first rival in the *unchanged* 2–6-rider micro physics, rather than moving a rival by only 8m longitudinally.

Neither research experiment modifies the selected race engine, energy physics, production rider data, Supabase, live results or game clock. The new standalone scripts are in `scripts/v3/`. All exercise the original finite W-prime and swept-collision tests wherever relevant.

## Part 1 — Nonlinear within-tick counterexamples (PASS)

[Nonlinear diagnostic CI: success](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40509061627).

Code: `scripts/v3/a2NonlinearSweepsV3.mjs`, `verify-a2-nonlinear-sweeps-v3.mjs`. They reconstruct **alternative hypothetical intermediate movements with identical endpoint positions** by changing when longitudinal or lateral progress occurs. Each reconstructed path is checked as a sequence of smaller, piecewise-affine sweeps. It is a *sensitivity analysis* and does **not** claim the accepted existing race paths actually bent this way.

The controlled bicycle example places a stationary rider at `x=10m, y=0m` and a moving rider from `(0,0)` to `(20,2)`. Under the original **affine** 10s sweep, the riders' physical envelopes never overlap. But with endpoint-identical **delayed lateral steering** or **front-loaded forward motion**, reconstructed intermediate swept paths do collide.

A second controlled example keeps the same longitudinal/lateral endpoints and shows that a mathematically tied crossing/entry pair under affine interpolation is **pass-before** with front-loaded acceleration or delayed steering, and **pass-after** with delayed acceleration or front-loaded steering.

**Technical PASS, sporting consequence:** the A24 exact fractional order is exact **only inside its stated affine assumption**. Without validated within-tick acceleration/steering trajectories, neither the accepted endpoint pair nor its affine order constitutes an unconditional real-world safety or event-order certificate. **This does not prove a collision occurred in actual simulated races.**

## Part 2 — Real starting-lane shifts (FAIL / INCOMPLETE)

[Five-job actual-lane matrix — each job FAILED](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40510105506).

Code: `scripts/v3/audit-a2-start-lanes-v3.mjs` and isolated workflow `v3-a2-start-lanes.yml`. Across four **synthetic** road widths/envelopes, two follower headways, two relative requested forward distances and 40 simulated ten-second ticks per test, the suite compares:
- Original starting positions.
- Trailing cyclist moved to lane 0 or lane 2.
- Leader moved to lane 0 or lane 2.
- First rival moved to lane 1 or lane 3, where applicable.
- Original vs early and delayed rival-entry scenarios and, for 4–6 riders, another laterally moving claimant.

Every accepted case still runs the previously approved *micro technical* swept-collision, energy and exact JSON midpoint replay checks. All results are research-only. The suite reports a technical error rather than misclassifying that scenario as a sporting failure.

### Technical gate — **NOT PASSED**

| Rider field size | Tested | Technical passes | Technical failures |
|---|---:|---:|---:|
| 2 | 80 | 76 | 4 |
| 3 | 336 | 323 | 13 |
| 4 | 448 | 430 | 18 |
| 5 | 448 | 431 | 17 |
| 6 | 448 | 431 | 17 |
| **Total** | **1,760** | **1,691** | **69** |

All 69 errors carry `Invalid simultaneous motion intent`. They are concentrated in the provisional 6.5m geometry, especially the follower-starts-in-lane-2 cases, plus a few leader-lane-0 cases. This is **consistent with a request crossing the research solver's exact one-lane/edge numerical bounds**, but **not confirmed as a purely floating-point bug**. The numerical fixture adjustment was attempted but not successfully committed/validated. Therefore the **five-job matrix remains red**, and we must not claim a complete engineering acceptance.

The CI output preserves per-scenario failure counts, and five JSON result artifacts were retained. Do not silently discard those 69 cases or adjust the solver's physical collision thresholds to obtain a passing gate.

### Sporting sensitivity among completed, technically valid cases

| Scenario | Original grid | Changed starting grid | Sustained passing |
|---|---|---|---|
| Open corridor | trailing cyclist lane 1 | trailing cyclist lane 0 | **80/80 → 0/80** |
| Delayed rival entry | trailing cyclist lane 1 | trailing cyclist lane 0 | **64/64 → 0/64** |
| Early rival entry | first rival lane 2 | first rival lane 1 | **64/64 → 32/64** |
| Two lane-changing claimants | first rival lane 2 | first rival lane 3 | **48/48 → 0/48** |
| Open corridor | trailing cyclist lane 1 | trailing cyclist lane 2 | **80/80 → 0 sustained**, but only **60/80 technically completed** |

Changing the leader to lane 0 still permits 64/64 early-blocker sustained overtakes in valid cases, but incurs **160 aggregate near-halted unrelated rider-ticks** where the original lane configuration incurred none.

These dramatic changes **are not normalized estimates of true peloton start-grid sensitivity**, because moving only one rider changes the traffic geometry and scripted passing opportunities. They do conclusively falsify the assumption that the original-grid 100% micro passing success extends unchanged to other ordinary starting lanes.

## Acceptance and next engineering gate

- **Nonlinear endpoint-equivalent safety diagnostic: PASS.**
- **Starting-lane robustness: FAIL (sporting).**
- **Starting-lane technical matrix: FAIL / INCOMPLETE (69/1,760 invalid motion intentions).**
- **Overall A2: SPORTING NO-GO.** A1 technical 2D foundation remains complete; B/C have not begun.

**Next bounded task:** inspect the actual rejected movement intents, including requested/achieved lateral coordinates, exact one-lane step differences and edge margins at the moment of failure. Correct numerical test-fixture boundaries *only if* evidence confirms a numerical fault, without loosening physical clearance. Then rerun the same 1,760 scenarios unchanged otherwise. Independently investigate why moving the follower to lane 0 suppresses every uncontested 60s pass: lane choice, physical capacity, requested intent vs achieved path, and observable overtaking events. After that, consider a constrained nonlinear substep solver and real-road geometry, rather than promoting another heuristic directly.

The resulting findings remain confined to offline research and do not authorize any production rollout.
