# Race Engine V3 — Milestone A2: fractional-tick event ordering and two competing riders

**27 October 2026 — TECHNICAL MICRO PASS; SPORTING NO-GO; gameplay algorithm unchanged.**

## Problem

The [A23 intent-aware admission study](MILESTONE_A_23_INTENT_AWARE_2026-10-27.md) successfully produced 60-second sustained passes in the available synthetic configurations, but recorded **88** passing events in the same 10-second tick as a primary blocker's lane-entry completion. Simply comparing integer tick-end timestamps could not determine which maneuver happened first. Also, the additional claimant's full lane completion had not been measured; moving laterally was insufficient evidence.

This study adds a separate **read-only affine sub-tick observer**, performs a fresh micro stress test with three different initial longitudinal grids, and independently verifies both competing claimants' *lane-entry boundary* and *final desired lane-center position*.

## Mathematical model and boundaries

The unchanged existing `simultaneousConflictResearchV3.mjs` and `continuousBicycleCollisionV3.mjs` already check each rider's accepted straight-line sweep from `(x0,y0)` to `(x1,y1)` over a 10-second movement interval. The new `scripts/v3/a2SubtickEventObserverV3.mjs` applies only to those **accepted** motions; it has **no authority to move riders, change power, release reservations, or write official race data**.

For the rider initially behind a leader, the observer finds the first strict negative-to-positive sign change in `Δx = x_rear - x_lead`. With endpoints `Δx0` and `Δx1`, its linear crossing fraction is `f_pass = -Δx0/(Δx1-Δx0)`. For an opposing rider moving toward the provisional outer lane centered at `y=0`, the first time it enters the lane's **half-spacing acceptance boundary** `y <= centerStepM/2` is `f_lane = (centerStepM/2-y0)/(y1-y0)`. Fractions in `[0,1]` are converted to `t_tick_start + f × 10s` and classified as strictly before, strictly after, simultaneous/numerically tied, or unobserved. Event ordering uses a 1e-6-second tolerance.

**Important:** crossing the half-spacing boundary is *not synonymous with reaching the lane center*, which is tracked separately. A strict longitudinal center crossing is **not itself a fully calibrated real-world overtaking clearance**. These are precise only **under the existing piecewise-linear, constant-within-tick swept-path assumption**. They are not proof of actual bicycle acceleration or rider timing between measurements.

The observer is JSON-serializable; unit tests check strict before/after/tied/no-event examples, a lateral reversal, serialized checkpoint reproduction and rider input permutation independence.

## Code, full CI and isolation

- [Affine observer and controlled unit tests](https://github.com/bracko87/ProPeloton-Manager/commit/a903464dcf37edc3a05a6bde1bbf25c91ab408be).
- [Three-grid stress audit](https://github.com/bracko87/ProPeloton-Manager/commit/c2a617e8e4bf65614fa5573a85770b29d9072b26).
- [Actual final-lane-center verification](https://github.com/bracko87/ProPeloton-Manager/commit/6e573ab2730944e7a8b107471db38e844982a893).
- [Final GitHub Actions matrix — 5 of 5 jobs SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40506297453), including original 2D collision, W-prime, complete-stage technical regression checks and the independent production application build.
- Detailed JSON artifacts `v3-a2-subtick-grid-2` through `v3-a2-subtick-grid-6` are retained for 30 days. They contain final classifications and progress/position measures; the observer module remains separately testable.

### Coverage

There are **1,536** synthetic runs of 40 × 10-second ticks, with field sizes 2/3/4/5/6 and four provisional width/clearance profiles (4m, 5m, 6.5m, cautious 5m). The test runs the previous **unmodified physics baseline** at the original grid (384 cases) and the **unchanged A23 intent-aware time-slot policy** at three grids (384 × 3 = 1,152 cases).

The additional grids shift **both rival starting longitudinal positions** by **+8m or −8m** while keeping lane coordinates, rider power, road widths, synthetic tactics and other parameters fixed. The original grid is the third. These are controlled longitudinal perturbations, **not a general lane-grid, field-position or peloton-bias certification**.

Cases include open corridors, early/first-tick lateral entry, second-tick entry, late lateral entry, actual left-then-right reversal and a second independently moving claimant. Headways 9m/18m, trailing requests 55m/75m per tick and a 45m leader demand remain scripted research fixtures, not realistic calibrated racing.

Every test verifies:
- No pair of accepted continuous bicycle sweeps physically overlaps under the provisional collision envelope; every rider's W-prime remains finite and nonnegative; no invented forward distance; all actions `officialWrites=0`.
- Exact mid-run JSON checkpoint recovery of physics, energy, the original 60-second pass observer, the intent-aware scheduler and **fractional event history**.
- Strict passing sustained for at least 60 model seconds. The **separate** fractional observer must observe a negative-to-positive longitudinal crossing to establish within-tick ordering.

## Final intent-aware primary-blocker outcomes (original grid)

| Scenario | Cases | Strict 60s sustained pass | Fractional-time classification | Rival reached required final lane center |
|---|---:|---:|---|---:|
| Entry communicated on tick 1 | 64 | **64/64** | **64 after** first lane entry | **64/64** |
| Entry communicated on tick 2 | 64 | **64/64** | **64 before** first lane entry | **64/64** |
| Entry communicated on tick 6 | 64 | **64/64** | **64 before** first lane entry | **64/64** |
| Rider enters left lane then reverses right | 64 | **64/64** | **64 before** initial left-lane entry | **64/64** back at specified right-hand lane center |
| Two other riders claim lateral space | 48 | **48/48** | **48 before** primary rival entry | **48/48 BOTH claimants** reached lane `y=0` center |

The remaining **80/80** initially open-lane cases produced sustained passes; they have no relevant opposing lane entry event, so comparing times is **unobserved / not applicable**.

The above outcomes held under **all three original/+8m/−8m starting configurations**: in each grid the intent-aware policy sustains 384/384 matched overtakes, and all 48 two-claimant scenarios establish **both rivals' final desired lane centers**. In the full intent-aware three-grid sample, the three-grid aggregate is therefore **1,152/1,152** sustained passes and **144/144** successful full-center completion of both claimants in their corresponding second-claim trials.

The earlier **88 tick-end ordering ambiguities** (32 second-tick entry, 32 reversal, 24 second-claim on the original grid) have a strict **pass-before-lane-entry** classification under the specific piecewise-linear swept-path interpolation. These cases were not silently assumed to be before or after: the observer solves fractional crossing times from both accepted continuous trajectories.

### Control and interpretability

The baseline policy continues to fail sustained passing in several contested lanes, while the intent-aware policy shows zero unrelated-rider near-stop ticks in these synthetic scenarios. The separate observer also finds **16 genuinely coincident/numerically tied events** in the baseline's immediate-entry condition; these remain **simultaneous or temporally unresolved**, not assigned an arbitrary order. A clean intent-aware result does not prove the simulator is universally free of same-tick ties.

The final-lane-center check uses an actual simulated lateral coordinate tolerance of **0.0001m**; it is stricter than entry into the 0.5-lane-spacing boundary. For the reversal case, completion is judged against its **final submitted rightward intention**, not the initial abandoned leftward destination.

## Decision

**MICRO ENGINEERING PASS. A2 SPORTING NO-GO / RESEARCH ONLY.**

The narrow issue of model-time ordering is substantially improved under one explicitly stated affine-motion assumption. The previously unverified *second claimant finishing its own lane change* is now measured and passes in all controlled second-claim fixtures. However, these are only **small, scripted synthetic traffic encounters**.

Remaining blockers before 12/24/32-rider integration:
1. **Nonlinear intratick rider motion and physical rider-envelope calibration** — center crossing and half-lane threshold are idealized proxies; independent proof is needed when real acceleration/lateral steering vary within 10 seconds.
2. More **starting lane changes, dynamic multi-rider positional perturbations, adversarial shifting intents**, and repeated traffic interactions instead of only +/−8m rival longitude.
3. Source-verified real route widths and elevation profiles, fractional finish-line W-prime accounting, group/breakaway/pursuit dynamics, peloton shape and realistic classification/gaps on full Dordrecht and Guangxi stages.
4. Only after A2 sporting approval would gameplay integration (B) and production readiness (C) become candidates for advancement.

**A1 technically complete. A2 still OPEN / SPORTING NO-GO. B/C NOT STARTED. Live engine and game clock unchanged.**
