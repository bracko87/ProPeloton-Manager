# Race Engine V3 — Batch 38: persistent same-wheel queues and finite-duration passing shadows

**Date:** October 26, 2026  
**Research commits:** [8159feb2](https://github.com/bracko87/ProPeloton-Manager/commit/8159feb2eddfcf585c45ea8e004c9302ecf0de32), [443f006b](https://github.com/bracko87/ProPeloton-Manager/commit/443f006be5dc1fb156fe7e995b73eb09e2355d5c), [73f61f58](https://github.com/bracko87/ProPeloton-Manager/commit/73f61f580ba41b4d1cb598b34f250afbe3339446).  
**Decision: ENGINEERING PASS / SPORTING NO-GO / OFFLINE ONLY.** Zero official writes. No production engine, physics source, database, race results, replay, worker or game-clock change.

## Experimental design

Batch 37 identified each particular previously reserved wheel constraining a follower. Batch 38 measures whether that **same leader** continues to constrain the follower for 3, 6 and 12 consecutive **10-second ticks**, then models a strictly bounded hypothetical passing reservation.

For each of two frozen source-stage fixtures (Dordrecht **106 riders** and Guangxi **168 riders**), with W-prime energy-only and experimental finite passing, three starting grids, and frozen/artificial headwind weather, **24 unchanged full-stage reference races** are completed. The first **144 ticks = 24 simulated minutes** of each race are diagnosed; every control result is verified against exact continuation from its JSON checkpoint, and each original-grid frozen-weather race is checked against uninterrupted `runCoupledV3`.

**One-rider hypothetical steering reservation**:
1. Require the rider to be physically blocked by the **same wheel for at least 3 consecutive ticks**. Choose a single independent, planner-approved adjacent lane with swept-clearance checks; never depend on another candidate changing lanes.
2. Allow **two 10-second reaction ticks** before steering starts. No physical lane change or longitudinal distance credit is granted in these ticks.
3. Run either **three** or **four additional 10-second steering ticks**, requiring the destination corridor to remain clear for the full linear trajectory of each tick. Existing original-lane motion is retained. A lane conflict or original-lane change rejects the hypothetical attempt; unsafe passing is never forced.
4. Simulate the **actual W-prime research ledger** on the baseline achieved mechanical watts plus **35 extra watts during each steering tick**. Reject if the hypothetical reserve cannot cover the work. This alternative ledger is **not** applied to the original race.
5. At a successfully completed reservation, run **one frozen next-tick** comparison with the candidate hypothetically in the neighboring lane, preserving the actual original rider speed demands, longitudinal positions and energy inputs. The existing spatial solver must accept the resulting wheel arrangement without collisions.

This is deliberately a **conservative destination-lane occupancy shadow**, **not continuous lateral steering implemented in physics**. It cannot establish realism of in-between lane occupancy, passing turn rate or cyclist steering dynamics. All next-tick comparisons are **independently reset to the unchanged baseline**; their movement deltas cannot be added together or propagated to claim better finishing times.

## Persistent obstruction starts early

| Original synthetic grid, frozen weather | Dordrecht energy | Dordrecht finite passing | Guangxi energy | Guangxi finite passing |
|---|---:|---:|---:|---:|
| First blocked wheel | 50 s | 50 s | 60 s | 60 s |
| First continuous 3-tick queue | 70 s | 70 s | 80 s | 80 s |
| First continuous 6-tick queue | 100 s | 100 s | 110 s | 110 s |
| First sampled 30-m geometric group split | 120 s | 120 s | 280 s | 280 s |
| **Longest same-leader queue in 144 ticks** | **140 ticks** | **140 ticks** | **139 ticks** | **139 ticks** |
| Riders with at least one 12-tick queue | 89 / 106 | **91 / 106** | **152 / 168** | **152 / 168** |
| Total physically blocked rider-ticks | 9,225 | 9,533 | 18,592 | 18,695 |

A 140-tick queue corresponds to **23 minutes 20 seconds** of continuous obstruction behind the same identified wheel, within this **synthetic** source route and power model. It is not a real-world rider observation, nor necessarily the final stage time gap. In the synthetic head/crosswind conditions, the first obstruction occurs at **30 seconds Dordrecht** and **40 seconds Guangxi**, with longest observed queues **142 and 141 ticks**, respectively.

## Safe multi-tick shadow outcomes

The original-grid, frozen-weather independent reservation tests:

| Rider experiment | Dordrecht energy | Dordrecht finite pass | Guangxi energy | Guangxi finite pass |
|---|---:|---:|---:|---:|
| 3-tick attempts | 15 | 14 | 14 | 14 |
| 3-tick safe next-tick comparisons | **13** | 9 | 9 | 9 |
| 4-tick attempts | 15 | 14 | 14 | 14 |
| 4-tick safe next-tick comparisons | **12** | 8 | 8 | 9 |
| Three-tick rejected due to swept-lane conflict | 2 | 3 | 5 | 4 |
| Four-tick rejected due to swept-lane conflict | 3 | 4 | 5 | 4 |

Across **all 24 reference races**, including all grids, regimes and modes:
- **Three steering ticks:** 351 attempts, **282** accepted through the independent next-tick comparison; **60** rejected due to destination lane swept-trajectory conflict.
- **Four steering ticks:** 351 attempts, **259** accepted through the next-tick comparison; **77** rejected due to swept conflict.
- **Zero W-prime-budget rejections at 35 W** in both experimental arms. This confirms only that the particular provisional riders and these early intervals could afford the additional simulated work. It **does not** prove that prolonged repeated overtaking is affordable, or that W-prime depletion is sufficiently calibrated for gameplay.
- Other incomplete attempts include riders moving lanes under the unmodified race while the shadow was pending, or failing the later comparator; never silently promote or count as successful.
- Every accepted three-tick maneuver is assigned **1,050 J of additional mechanical work** and every accepted four-tick maneuver **1,400 J**, corresponding to 35 watts × 30 or 40 seconds. Aggregate work entries in evidence refer to the independent accepted snapshots, **not an energy cost paid by any rider in a single full race**.

The results support continued investigation of *persistent queues*, not the claim that the alternative has corrected a full-race finish. It has **not**.

## Evidence and technical validation

- [Batch 38 full 4-job matrix, paired shadow solver, 24 completed 106/168-rider reference races, exact checkpoint recovery and application build — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40338029017).
- [Existing V3 legacy-isolation validation — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40338028783), 51 completed steps, no failed steps and no `##[error]` entries in reviewed logs.
- Dedicated unit tests validate consecutive same-leader streaks, reset on a new wheel, forced full-lane collision rejection, the two-tick reaction delay, 3/4-tick duration and finite W-prime ledger.
- The first CI attempt failed **a bad unit-test fixture**, which placed a bike **3 m** away rather than violating the 1.8-metre wheel spacing. Correcting it to a genuine **1 m** conflict resolved CI; **no collision rule or production source was modified**.
- Four GitHub Actions JSON artifacts, 30-day retention, contain the full rider classifications, per-grid/per-weather queue lengths, 3/6/12-tick counts, candidate rejections, energy ledger costs, exact restart results and all completed frozen next-tick comparisons.

**Known sporting-data blocker persists:** The existing World Nations Hilly/Mountain route-fidelity check reports 1,785 m declared climbing, **720 m represented**, **1,065 m missing** and sporting approval blocked. The frozen Guangxi route proxy separately lacks **718 m** of reported ascent. Provisional CdA and W-prime and simplified Dordrecht sprint orders remain unvalidated.

## Sporting decision and next experiment

**SPORTING NO-GO.** Long same-wheel queues and conservatively clear destinations are real behaviors in this offline model, but these tests do **not** establish safe continuous two-dimensional bicycle trajectories, actual willingness/ability to pass, competitive energy fatigue, realistic gap dynamics or race-quality finish classifications.

**Batch 39 candidate:** implement a *separate offline continuous lateral-position state* with bicycle width, gradual lateral velocity, occupancy over the entire steering interval, reaction delay and no longitudinal distance grants. Use it to check whether physically valid passing actually clears the 2-minute same-wheel queues, and run controlled full-race paired comparisons with identical tactics and energy. Repair source-route climbing accuracy before any sporting activation.

**Production live races, historical classifications, Supabase and game clocks are unchanged.**
