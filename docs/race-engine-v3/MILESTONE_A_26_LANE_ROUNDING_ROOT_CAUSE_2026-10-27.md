# Race Engine V3 — A2 Step 26: wide-road numerical boundary and lane-0 passing root cause

**27 October 2026 — TECHNICAL MATRIX RESTORED 1,760/1,760; OPEN-ROAD START-LANE SPORTING NO-GO.**

## Scope and isolation

This work follows the [A25 starting-lane audit](MILESTONE_A_25_NONLINEAR_START_LANES_2026-10-27.md), which had 69 `Invalid simultaneous motion intent` technical failures and severe passing sensitivity. Two tightly scoped, **offline-only** investigations were completed:

1. Determine and correct a *demonstrable sub-micrometre coordinate rounding error* in the synthetic 6.5m-road test input, preserving the physical solver unchanged; rerun **the same 1,760 lane-grid cases**.
2. Compare the 80 open-road lane-0 follower configurations against an otherwise identical, voluntary **stay in lane 0** control, to isolate whether attempted steering is responsible for the passing collapse.

No source physics, continuous bicycle collision rules, energy equations, rider statistics, live race engine, race classifications, Supabase records, or game clock were modified. Research scripts and workflows reside only under `scripts/v3/` and `.github/workflows/`.

## A26.1 — Exact numerical defect, corrected solely at the fixture boundary

The simulator's unchanged `resolveSimultaneousPathsV3` rightfully requires a submitted lateral target to satisfy:

`targetY <= (laneCount - 1) × centerStepM`

For a provisional road whose lane step is **1.2m**, the rightmost bound in binary floating point is `3 × 1.2 = 3.5999999999999996`. However, the research time-slot scheduler occasionally emits the six-decimal rounded value **3.6**, which exceeds that bound by `4.440892098500626e-16` metres. The earlier instrumentation showed that **all 69 failed cases** reported `Invalid simultaneous motion intent`, heavily concentrated in this wide-road layout.

In [commit `1bc1aafb`](https://github.com/bracko87/ProPeloton-Manager/commit/1bc1aafb42070d9f8ee9c6fbee4239efe0ab0d9c), the **lane-grid test harness alone** now adjusts a target *only* if it exceeds the exact outer edge by no more than **1e-9m**, moving it approximately **1e-6m inward**. Larger illegal requests are still rejected; no tolerances in the solver or physical safety envelope were widened. The exact same adjustment is performed on serialized checkpoint replay, keeping reproducibility meaningful.

**Final CI: [1,760-case starting-lane validation — 5/5 jobs SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40514550689).**

| Rider count | Cases | Technical passed | Technical failed |
|---|---:|---:|---:|
| 2 | 80 | 80 | 0 |
| 3 | 336 | 336 | 0 |
| 4 | 448 | 448 | 0 |
| 5 | 448 | 448 | 0 |
| 6 | 448 | 448 | 0 |
| **Total** | **1,760** | **1,760** | **0** |

Technical assertions continue to cover full accepted swept bicycle paths, finite/nonnegative W-prime, JSON-exact midpoint physics and intent-policy replay, and lack of official game writes. Production application build and baseline 2D micro/full-stage *technical regressions* passed in the same CI.

**Qualification:** the tiny overrun is a confirmed floating-point boundary defect, and the corrected complete matrix is now green. There is no separate instrumented one-to-one trace proving every former rejected move had this same exact overrun; the fact that correcting *only* this defect removes all 69 makes it the supported operational explanation for those failures.

## A26.2 — Starting lane still controls sporting results

Technical compliance **does not** mean realistic peloton racing. Relevant post-fix research outcomes include:

| Synthetic scene / variant | Sustained rear-on-leader passes |
|---|---:|
| Open course, original follower starting in lane 1 | **80/80** |
| Open course, follower initially moved to lane 0 | **0/80** |
| Open course, follower moved to lane 2 | **80/80** |
| Late rival entry, original follower lane 1 | **64/64** |
| Late rival entry, follower lane 0 | **0/64** |
| Early rival entry, rival moved from lane 2 to lane 1 | **32/64** |
| Two rival claimants, first rival moved to lane 3 | **0/48** |

This is genuine lane-layout sensitivity in the scripted 2–6-rider micro research model. The grid inputs change only lateral starting locations, not rider power/forward requests, yet produce large differences. These are not measured full-stage ranking or real-life probability estimates.

## A26.3 — Independent lane-0 counterfactual identifies the steering mistake

An additional [160-case control run — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40515018164) compares **80 matched open-road lane-0 fixtures under each of two policies**, with the same bicycle physics, road widths, rider power, 10-second ticks, energy budget and checkpoint test.

Both policies start with the trailing rider on **lane 0** and the leading rider on **lane 1**. The existing `selectEarlyCorridorV3` enumerates **adjacent** lanes only. From lane 0, its only candidate is lane 1 — **already occupied by the leader** within 9–18 metres. The intent-aware time-slot wrapper accordingly starts by observing and later requests that occupied lane, rather than recognising that the trailing rider can continue faster **without leaving its already-clear lane 0**.

| Controlled lane-0 policy | Technically safe cases | Sustained 60s overtakes | Rear near-halted rider-ticks |
|---|---:|---:|---:|
| Existing intent-aware adjacency selector | 80/80 | **0/80** | **449** |
| Remain in the clear current lane | 80/80 | **80/80** | **0** |

A representative baseline-5m, two-rider, 9m-headway run demonstrates the mechanism: during tick 2, the intent-aware policy requests lane 1, the continuous collision resolver suppresses the attempted crossing into the leading rider, and the lead/rear gap ultimately remains approximately **−1.8m**. Under the no-steering control, the rear rider remains at `y=0`, overtakes the leader by tick 2, and finishes the 400s trial **385m ahead**. Every accepted continuous swept bicycle path remains collision-free in both control arms.

**Root cause:** the policy assumes overtaking requires a *change into an adjacent lane*, even when its current lane is already clear. This is a **strategy/admission error**, not a lack of safe passing space or a need to relax bicycle collision constraints. The controlled no-steering policy is evidence of a feasible alternative in *these specific open-road scenes*; it has not been challenged against newly arriving rivals in the same lane and is **not yet approved for general use**.

## Decision and next research gate

- The **69 invalid-motion technical failures are resolved** by test-fixture numeric bounds. A26.1 PASS.
- Lane-layout sporting robustness **still FAILS**. A26.2 NO-GO.
- A **counterfactual causally isolates** unnecessary steering as the reason for the particular lane-0 open-road failure. A26.3 diagnostic PASS.
- The original A25 nonlinear endpoint-equivalent collision counterexample remains valid; endpoint-only affine safety is not proof of arbitrary nonlinear intratick motion safety.

**Next tightly scoped A2 task:** develop a separate offline **current-lane feasibility gate** that first considers proceeding straight in an already-clear lane, and only requests an adjacent lane when that is necessary and its future conflict risk is acceptable. Compare it head-to-head with the original intent-aware policy in **all 1,760 lateral lane scenarios**, *including the early/delayed and both-claimant cases*. Assert no involuntary opponent control, no swept-path collisions, finite W-prime, exact recovery, completion of other riders' movements, and a reduced tally of gratuitous halts. Do not declare success on the 80 open-road controls alone. Afterwards test more varied timing/grids and nonlinear substeps.

A1 technical foundation complete. **A2 SPORTING OPEN / NO-GO; B/C NOT STARTED.** No production authorization or official writes.
