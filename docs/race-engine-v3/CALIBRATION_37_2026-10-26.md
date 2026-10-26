# Race Engine V3 — Batch 37: precise wheel reservations and bounded next-tick lane counterfactuals

**Date:** 26 October 2026
**Commits:** [research and workflow](https://github.com/bracko87/ProPeloton-Manager/commit/f7486c067dd494ab9f56a6b52f63405067047409), [unit-test fixture correction](https://github.com/bracko87/ProPeloton-Manager/commit/59402a77e503c530cfd8d9631ff2e34dea235160).
**Status: ENGINEERING PASS / SPORTING NO-GO.** OFFLINE-ONLY. All official writes: **zero**.

## Goal and design

Batch 36 demonstrated that changing aerodynamic speed demand at identical rider positions and reserves can immediately change thousands of movements; however, its equal-row lane swap opportunities were too rare to establish the independent role of wheel reservations. Batch 37 reconstructs the **actual front-to-back same-lane endpoint reservation** restricting each follower, measures how many metres the rider was prevented from travelling relative to its commanded speed, and tests a *single independently safe lateral preparation* after a completed tick against the following tick with **the same power-limited speed commands**.

Two levels of separation are critical:
1. **Actual attribution:** rerun the physical solver for the precise pre-tick positions, tactics (including pending finite-pass `recover`), energy, commanded velocities, lanes and road settings. Reject every observed tick that does not reproduce each rider's achieved metres, speed, lane and blocked flag. Record the completed same-lane leader endpoint, original-lane clipping, adjacent lane start-occupancy conflict, already-reserved endpoint and current-tick accepted lateral moves.
2. **Counterfactual:** after an actual blocked tick, identify **one** safe adjacent destination from the existing swept-corridor anticipatory planner. Confirm its safety independently, not assuming other planned riders also shift. The original completed tick remains at exactly the **same travelled metres** and energy. Replay **only the following tick** with precisely the original commands for every rider, altering only this one candidate lane. The existing finite-road solver checks collision safety. No alternative physics is propagated beyond this isolated next step.

These are *independent hypothetical one-tick samples*, not a sequence of interventions in a single actual race. Their forward-distance changes must **not** be added up to claim a full-stage gain. A discrete at-tick-boundary lane assignment is not continuous validated lateral steering.

## Experiment scale

**Two complete stage fixtures** (106 riders Dordrecht; 168 Guangxi) × **two research modes** (W-prime energy-only and W-prime plus finite three-tick passing) × **three deterministic neutral grid seeds** × **two weather configurations** (frozen and synthetic +3 m/s headwind / +2 m/s crosswind). This produces **24 unchanged full-race control simulations**, all with full finish results, plus the first **144 ten-second ticks (24 simulated minutes)** of source-level wheel attribution and isolated next-tick counterfactuals per run.

Every original-grid frozen-weather control must equal uninterrupted `runCoupledV3` exactly. All 24 reference outcomes must equal a resumed JSON-serialized checkpoint result exactly, with the original source solver and official-write gates unmodified.

### When the first important physical events happen (frozen original grid)

| Fixture and mode | First blocked wheel | First safe lane preparation | First next-tick effect on movement | First 30-metre geometric group gap |
|---|---:|---:|---:|---:|
| Dordrecht energy-only | 50 s | 70 s | 80 s | 120 s |
| Dordrecht finite passing | 50 s | 110 s | 120 s | 120 s |
| Guangxi energy-only | 60 s | 90 s | 100 s | 280 s |
| Guangxi finite passing | 60 s | 100 s | 110 s | 280 s |

Artificial +3/+2 m/s head/crosswind brings the first wheel blockage earlier: **30 seconds** in Dordrecht and **40 seconds** in Guangxi, both modes. The 30-metre gap is a *spatial geometry metric*, **not an established official breakaway group**.

### First 24 simulated minutes, frozen original grid

| Measurement | Dordrecht energy | Dordrecht finite-pass | Guangxi energy | Guangxi finite-pass |
|---|---:|---:|---:|---:|
| Blocked **rider-ticks** | 9,225 | 9,533 | 18,592 | 18,695 |
| Aggregate fieldwide commanded-minus-achieved distance | 72,374 m | 73,918 m | 129,637 m | 132,169 m |
| Single-rider independent safe lane preparations identified | 138 | 120 | 136 | 119 |
| Safe next-tick independent tests completed | 137 | 119 | 135 | 118 |
| Number of rider movement outcomes altered, **summed across independent tests** | 440 | 309 | 1,239 | 629 |
| Number of wheel-limited status changes across those tests | 106 | 96 | 129 | 119 |

**Interpretation:** the aggregate lost metres are added over **all riders and all ticks**, not the distance lost by any one rider or a time-gap prediction. The following-tick test demonstrates local crowd effects, not a validated improvement to the full race. A blocked rider may not have a safe lane **within** its current tick but can be prepared safely for the next; that new starting lane can change several neighbors' movements. The player-facing rule remains unchanged.

The combined method records the nearest current same-lane *planned* leader, not merely the aerodynamic slipstream leader. There can be more same-lane initial clipping events than final blocked rider-ticks because a rider may legally complete a same-tick lateral move. Ticks with an existing pending finite passing reservation are skipped for candidate generation; these are **not unsafe passing attempts**.

## Evidence and validation

- [Full Batch 37 four-job matrix — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40332306522). Each job verifies exact wheel solver reproduction, safe swept-interval lane proposals, 6 complete reference races, serialized restart equivalence and zero official writes. The Dordrecht energy job also verifies the production application build.
- [Existing 51-step V3 legacy isolation — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40332308675), **0 failed steps and no GitHub `##[error]` entries**, independently verified in job logs. The legacy route-fidelity check still correctly prevents sporting activation for the World Nations mountain race: 1,785 m declared ascent versus 720 m represented, **1,065 m missing**.
- Separate route-data issue: the frozen synthetic Guangxi mountain profile is missing **718 m** of reported ascent. Dordrecht point-sprint tactics remain approximated.
- Final CI fixed a bad unit-test fixture where bicycles were **4 m apart**, not colliding. With the test corrected to genuine **1 m separation** against a **1.8 m minimum**, collision rejection passed in all final jobs. **No physics or collision rule was relaxed**.
- Four downloadable Actions JSON artifacts, retained 30 days, one per fixture × mode. Each includes the complete 24-minute per-tick observations, initial leader IDs and clips, candidate swept safety, next-tick deltas, group timing, original full-race classifications and checkpoint flags.

**Repository diff:** only `scripts/v3/wheelReservationAttributionV3.mjs`, `scripts/v3/verify-batch37-reservations-v3.mjs`, `scripts/v3/audit-batch37-reservations-v3.mjs`, `.github/workflows/v3-batch37-wheel-reservations.yml`, and this report. No `src/race-engine-v3/**` or live application calculation was changed.

## Sporting decision and Batch 38

**No sporting approval.** The measurements clearly localize wheel-queue obstruction and demonstrate that safe next-tick lane preparation has nontrivial local effects under identical requested speed. They do **not** establish a safe multi-tick continuous lane steering and energy-cost rule, much less a credible improvement in full-race finishing gaps.

**Batch 38:** study persistent wheel queues and physically bounded **multi-tick lateral steering** with explicit energy cost, reaction delay, and lane occupancy through multiple ticks. Measure first 30-metre separation under controlled power and stage grades; then test full 106/168-rider races only after local collision and exact checkpoint proof. Repair real source-route climbing data before any production switching.

**Final: ENGINEERING PASS; SPORTING NO-GO; OFFLINE-ONLY; official results and game clocks untouched.**
