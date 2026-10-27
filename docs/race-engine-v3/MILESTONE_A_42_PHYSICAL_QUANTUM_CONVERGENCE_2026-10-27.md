# Race Engine V3 — Milestone A Step 42: fixed physical quantum and convergence study

**27 October 2026 — 440/440 OFFLINE technical simulations passed; numerical convergence and sporting realism NO-GO.**

## Scope

A41 solved the representation-level road reflection defect in the tested configurations, but showed the existing conflict-resolution physics was still strongly dependent on time step. A42 isolates two different concepts that must not be confused:

1. **Physical integration quantum**: how often the coupled swept-collision, movement and W-prime solver actually advances.
2. **Reporting/view cadence**: how often clients or analytical outputs request information. Changing the reporting cadence by itself must not change physics and must not replace actual accepted swept paths with unverified endpoint chords.

This is a simulation-only experiment in `scripts/v3/a2FixedQuantumResearchV3.mjs`. The A34 research solver now accepts **20 substeps per 10-second tick (0.5 seconds per physical step)** in addition to its original allowed values; no other collision, movement, steering or W-prime logic was changed. The standalone wrapper always delegates to the **unchanged symmetric-halving research solver** with the configured 0.5 or 1-second physics quantum and preserves all actual accepted path knots. A 2, 2.5 or 5-second *reporting interval* is only an independently validated metadata label; the wrapper deliberately does not generate untested interpolated spatial positions.

The installed live source-game engine, historical classifications, money, player results, Supabase and clock were untouched.

## Experimental design

[GitHub A42 verified test run](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40586131748) completed **440/440** research runs, all 60 synthetic seconds with the same six immutable ten-second rider command sets:

- Four provisional road envelopes × five sizes (2, 8, 12, 24, 32) × two variations = **40 matched configurations**.
- Five genuine A34 physical step sizes: **0.5, 1, 2, 2.5 and 5 seconds**, for **200 native physical runs**.
- For each 40-case fixture, run **two fixed physical quanta (0.5s and 1s)** under three independently requested 2/2.5/5-second display/report cadences, for **240 wrapper runs**.

Each native/wrapper run was checked for exact unchanged commands, all-rider all-pair swept motion on the full actual knot sequence, no missed-by-chord collision, no negative or nonfinite W-prime, exact cumulative mechanical energy ledger equality, no accepted pairwise overlap, and deterministic JSON 30s checkpoint recovery to the same 60s result. **0 official writes**, sporting approval **NOT_APPROVED**.

Earlier A41/A40/A39/A38/A37/A36/A35/A34/A33/A32 and complete-stage technical checks plus production React build ran in the separate regression job; a green technical test does **not** imply sporting acceptance. Synthetic single-minute ordering differences are not real race classifications.

## Measured timestep disagreement

**Relative to the 0.5-second A34 physical run for exactly the same 40 starting states and commands:**

| Physical step | Maximum rider position deviation | Maximum leader-gap deviation | Maximum W-prime deviation | Rider-pair positional inversions | Near-stop rider ticks |
|---|---:|---:|---:|---:|---:|
| **0.5s reference** | 0m | 0m | 0J | 0 | 24 |
| **1s** | **270.165m** | 270.965m | 74.04J | **887** | 50 |
| **2s** | 209.420m | 210.170m | 54.20J | 781 | 80 |
| **2.5s** | 200.942m | 203.507m | 74.04J | 855 | 26 |
| **5s** | 232.166m | 237.354m | 83.53J | 913 | 54 |

The reference here is purely computational: **0.5 seconds is not proved to be the physical truth**. Divergence varies nonmonotonically. In this model, simply halving the timestep from 1s to 0.5s does *not* produce nearby outcomes. No convergence order, calibrated collision response or sporting legitimacy can be inferred.

### Cost of finer physical stepping

| Physical step | Total rider-substep evaluations | Checked conflict-pair proposals | Collision detections among rejected provisional paths |
|---|---:|---:|---:|
| 0.5s | 74,880 | 4,843,260 | 25,206 |
| 1s | 37,440 | 3,325,870 | 23,290 |
| 2s | 18,720 | 1,792,218 | 14,943 |
| 2.5s | 14,976 | 1,228,858 | 10,287 |
| 5s | 7,488 | 612,824 | 6,473 |

These are measured research operation counters over the test fixtures, **not benchmarks of real-world stage throughput**. The number of rejected proposal conflicts is not a crash or injury count. Higher computational effort did not yield verified numerical convergence.

## Reporting separation — passed, but not physics approval

The 240 fixed-quantum-wrapper runs were all **exactly identical** to the corresponding native quantum run at the same physical step size, regardless of whether the selected reporting label was 2, 2.5 or 5 seconds. Final x/y, gap-to-front, W-prime, rider order, all official write counters, accepted full knot sets and serialized physics checkpoints matched.

This is an important architectural safety invariant and **holds by construction**: reporting cadence is not permitted to influence physical stepping. It is **not a test of interpolation quality or a demonstration of time-step-independent physical mechanics**, because the three reporting choices do not change the underlying integrator. The wrapper does not claim safe rider coordinates at arbitrary display timestamps that fall between the 0.5/1s accepted physical samples.

## Decision and next experiment

**Step A42 technical and reporting-cadence isolation PASS. Physical numerical convergence and A2 sporting acceptance NO-GO.** Do not promote the fixed-quantum wrapper or a 0.5-second heuristic as a live solver. It adds more calculations but does not resolve the underlying collision-priority, gap and overtaking instability.

**Step A43 priority:** use the same 40 fixtures to record the first causal difference between actual **0.5s vs 1s** accepted trajectories, inspect equal-time collision groups and which cyclist's movement is attenuated, then test a physically justified event-time/corridor approach (not another label-dependent heuristic). Acceptance must require independently collision-free space-time paths, finite energy, faithful replay, rider-ID and left/right fairness, and simultaneously improved convergence of positions, gaps and overtaking rankings. Even passing synthetic gates would not close sourced real terrain/road geometry, drafting, 106/168-rider full-stage realistic gaps or production-readiness blockers.

**Milestones B/C remain NOT STARTED**, and no production switch, live race or game-clock event was executed.
