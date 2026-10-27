# Race Engine V3 — A2 Step 28: bounded, non-coercive current-lane release

**27 October 2026 — 7,040/7,040 MICRO TECHNICAL PASSES; SPORTING STILL NO-GO.**

## Objective

[A27 current-lane research](MILESTONE_A_27_CURRENT_LANE_GUARD_2026-10-27.md) demonstrated that choosing to remain in an already-clear lane can correct an artificial steering obstruction, but an unconditional current-lane preference creates new congestion when one or two other cyclists enter the corridor. This step tests whether a **bounded, voluntary stay** can help the faster follower without delaying a nonconsenting rival or breaking already successful cases.

This is a small, scripted **offline micro policy experiment only**. It is **not a calibrated peloton, full-stage test, race-physics change, or production activation**.

## Engineering model

New `scripts/v3/a2BoundedLaneReleaseV3.mjs` wraps the existing outer-lane-only current-lane policy:
- Initially, the requesting follower must have started in lane 0, laterally separated from its leader, to be eligible.
- When another cyclist's **currently submitted** swept trajectory conflicts with staying in lane 0, the requesting follower may **voluntarily remain in lane 0** for at most **one** or **two** consecutive conflict ticks (two independent research policies).
- The other cyclist's submitted lateral and longitudinal commands are never overwritten; there is **no presumption of consent or forced opponent yield**.
- The requesting follower retains its submitted forward demand during its voluntary stay. The unchanged `simultaneousConflictResearchV3.mjs` physics decides how far it can **actually** move, while checking the full swept bicycle envelopes and W-prime. Calling this a bounded 'release' does not imply the competing rider is guaranteed a clear space or that its move occurs first.
- At the hold cap, the policy falls back to the previous intent-aware corridor policy. After a hazard clears, a later conflict can initiate another bounded sequence. Its state and metrics are JSON-serializable and deterministic.

Code: [bounded release and micro tests](https://github.com/bracko87/ProPeloton-Manager/commit/1d2445b2e70c99601eaa03fe1d0cf2ff679ea706), [full four-policy audit and CI](https://github.com/bracko87/ProPeloton-Manager/commit/e924db28dd9ff4aebb7fc863bf183d31d63384b8).

No canonical or live simulation solver source, gameplay UI, Supabase data, results, clock, or production selection was touched. The research code and checks live exclusively under `scripts/v3/` and dedicated `.github/workflows/`. Both hold limits explicitly mark `officialWrites=0` and `sportingApproval=NOT_APPROVED`.

## Exact matched experimental matrix

The same **1,760 distinct starting-grid fixtures** from A27 were run under **four policies**, yielding **7,040 complete cases**:
1. Baseline intent-aware adjacent-lane policy.
2. A27 initial-lane-0 guarded current-lane preference.
3. New maximum-one-tick voluntary stay (`bounded_hold_1`).
4. New maximum-two-tick voluntary stay (`bounded_hold_2`).

Field sizes 2, 3, 4, 5 and 6 riders; 4 provisional/unverified road widths and rider envelopes; initial 9m/18m headways; two faster-follower requested velocities; original and actual alternate rider starting **lanes**, with open road, early rival entry, late entry and two simultaneous claimants where applicable. Every case runs **40 × 10 simulated seconds**.

[Final comparison CI: five jobs all SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40527149124), plus [separate unit + application-build CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40526904473).

All **7,040 cases technically passed** continuous accepted swept-path collisions, nonnegative/finite energy, requested-vs-achieved distance, exact serialized tick-20 replay of physical positions, W-prime, passing classifications and policy state. In addition, nonconsenting rival requests were not overwritten. Existing original coupled 2D and full-stage *technical regression suites* and an independent application build passed within the CI matrix. Full case-level JSON artifacts `v3-a2-bounded-release-2` through `v3-a2-bounded-release-6` are retained for 30 days.

A 'sustained overtake' is still a strict longitudinal crossing held at least 60 simulated seconds; a near-stop is actual travel under 0.5m over a ten-second step. These are **model counters**, not field-calibrated cycling performance.

## Complete sporting outcomes (1,760 matched fixtures **per policy**)

| Measure | Existing baseline | A27 lane-0 guard | **One-tick stay** | **Two-tick stay** |
|---|---:|---:|---:|---:|
| Technical successes | 1,760 | 1,760 | **1,760** | 1,760 |
| Sustained 60s overtakes | 1,502 | **1,610** | 1,590 | 1,542 |
| Near-halted follower ticks | 1,102 | 692 | **355** | 1,038 |
| Near-halted unrelated rider ticks | 974 | 1,025 | **765** | 1,355 |
| Primary claimant final-lane arrivals (applicable trials) | 1,232 | 1,232 | **1,232** | 1,232 |
| Second claimant final-lane arrivals (applicable trials) | 336 | 336 | **336** | 336 |
| Recorded voluntary hold ticks | 0 | 0 | **272** | 856 |
| Recorded hold-cap events | 0 | 0 | **272** | 404 |

Compared with baseline, the one-tick stay adds **88 sustained overtakes** and reduces near-halted follower rider-ticks **1,102→355** and unrelated near-halted ticks **974→765**. Compared with the A27 guarded variant, it loses **20 sustained overtakes** but reduces near-halted follower ticks **692→355** and unrelated ticks **1,025→765**. The two-tick stay is clearly worse on congestion and overtaking; **reject it as an A2 sporting candidate**.

## Remaining adverse cases — must not be hidden

The original motivation was the follower starting in **lane 0**. For that exact starting-grid subset:

| Scenario | Baseline passes | A27 guard passes | One-tick stay passes | Two-tick stay passes |
|---|---:|---:|---:|---:|
| Open course (80) | 0 | 80 | **80** | 80 |
| Rival enters later (64) | 0 | 64 | **64** | 64 |
| Rival enters early (64) | **64** | 52 | **32** | 8 |
| Two rivals compete (48) | **48** | 24 | **24** | 0 |

The one-tick variant keeps **all** of the open-road and delayed-entry improvements, and preserves the primary/secondary rivals' completed final lanes in these synthetic runs. But its early-entry sustained overtakes fall by **32** relative to the old baseline; under the two-claimant scenario they fall by **24**. Thus it does not satisfy the strict sporting nonregression gate. More permissive holding is not a solution: two ticks worsen both early entry and the second-claim case.

The one-tick rule reduces unrelated near-stop ticks in the rear-lane-0 early-entry scene from the A27 guard's **285 to 17**, and near-stopped follower ticks **354→15**, but it still loses sustained overtakes. This demonstrates why passing success, forward congestion and both other riders' lane completion **must be evaluated separately** rather than reduced to a single 'winner' metric.

## Decision and next bounded gate

**Technical micro PASS. Sporting acceptance FAIL / NO-GO.** The one-tick policy is a useful research candidate that lowers aggregate blocked movement, but cannot replace the previous A27 guarded policy without sacrificing sustained passes under critical conflicts. The two-tick policy should not advance.

Next, for **the same contested rear-lane-0 micro scenarios**, separately test conditional first-conflict admission: distinguish a rival's **actively communicated early lane entry** or **multiple active claimants** from a later, initially inactive entrant. When early conflict is observed, it may be better to use the existing baseline rather than spend a voluntary hold. This must be a **current-observation, non-clairvoyant** selection with no unconsented control of rivals, with strict new-hazard safety, collision, energy and checkpoint replay.

Before any peloton expansion (12/24/32 or full 106/168), independently validate nonlinear sub-tick accelerations and steering, sourced real road widths and elevation, fractional finish energy, group/breakaway pursuit and full-stage starting-grid sensitivity. No results authorize switching the production racing engine.

**A1 technical foundation COMPLETE; A2 sporting OPEN / NO-GO; Milestones B and C NOT STARTED.**
