# Race Engine V3 — Milestone A2: early, coordinated passing corridor micro study

**27 October 2026 — 2–6 rider micro engineering PASS; controlled sustained passing demonstrated; full-race sporting NO-GO.**

## Goal and background

The [A2 unilateral choice feasibility audit](MILESTONE_A_16_YIELD_FEASIBILITY_2026-10-27.md) established that the previously attempted crossing-aware scoring policy could not rescue passing conflicts: every protected passing conflict in its 32-step one-rider attenuation search already had only one swept-collision-safe unilateral yield, and that option clipped the faster trailing rider. The new study tests **whether moving into an unoccupied side corridor *before* reaching that conflict, or a leader moving aside in coordination, permits a genuine sustained longitudinal pass**. It does not relax collision clearance or override other riders' paths.

## Implementation and isolation

Commit [`36582d8e`](https://github.com/bracko87/ProPeloton-Manager/commit/36582d8e6399aab287e8ae493e829a2d7bb40913) adds:

- `scripts/v3/a2EarlyCorridorV3.mjs`: a **frozen-current-position**, non-clairvoyant adjacent-corridor choice. It checks four-lane bounds and counts other bicycles already in each adjacent destination corridor at up to 25 metres ahead (or 1.8 metres behind); lower occupancy wins. It neither admits a pass nor predicts stage results.
- `scripts/v3/audit-a2-early-corridor-v3.mjs`: scripted **40 × 10s** small-group scenarios using the already-validated, **unchanged** `simultaneousConflictResearchV3.mjs` for every physical move, with the original swept bicycle collision check (`longitudinal=1.8m`, `lateral=0.8m` on the synthetic 5m road). Physics, rider energies, and the existing 2D game engine remain untouched.
- `.github/workflows/v3-a2-early-corridor.yml`: separate five-job (2,3,4,5,6 riders) matrix; micro collision and historical full-stage regressions, exact checkpoint/energy checks, and independent production build.

The scenarios start with a leader at 118m and trailing rider at 100m (18m gap; tight-headway variant 9m gap), both centered on synthetic lane 1. Constant synthetic requests are approximately 45m/10s for the leader versus 75m/10s for the follower; the established energy and acceleration ceiling still bounds *actual* travel. These intentionally produce a strong closing rider and are **not power-calibrated real race tactics**.

The third rider in the occupied-right case is at 112m on lane 2, while the left side remains open. Any additional riders stay in other nearby synthetic lanes. The `early` policy shifts the follower towards an open corridor at the first tick, `late` delays the shift until its front-wheel gap is no more than 5m, `coordinated` asks the leading rider to move to lane 0 while the follower maintains lane 1, and `forced_right` attempts lane 2 despite its occupation. The `adaptive` version instead chooses the unoccupied side **from current geometry**.

A pass is counted only when the persistent-passing observer records a strict longitudinal reversal `rear` ahead of `lead` and the new order remains uninterrupted for **at least 60 simulated seconds**. A crossing near the simulation end without a full 60-second observation does **not** count as a sustained pass.

## Completed results

[Five-job GitHub Actions validation: SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40485373192), with result JSON artifacts named `v3-a2-early-corridor-2` through `v3-a2-early-corridor-6`, retained for 30 days.

| Scenario | 2 riders | 3 riders | 4 riders | 5 riders | 6 riders |
|---|---|---|---|---|---|
| Clear corridor, move early — 60s pass | PASS | PASS | PASS | PASS | PASS |
| Clear corridor, wait until close — 60s pass | PASS | PASS | FAIL | FAIL | PASS |
| Leader yields into another lane — 60s pass | PASS | PASS | PASS | PASS | PASS |
| Tight 9m gap, move early — 60s pass | PASS | PASS | PASS | PASS | PASS |
| Tight 9m gap, move late — 60s pass | PASS | PASS | FAIL | FAIL | PASS |
| Occupied right corridor, force lane 2 — 60s pass | n/a | FAIL | FAIL | FAIL | FAIL |
| Occupied right corridor, select clear lane — 60s pass | n/a | PASS | PASS | PASS | PASS |

**First overtake times, clear lane:** `early` and `coordinated`: **30 seconds** in all five field sizes. `late`: 120s at 2/3 riders, 380s at 4/5 riders and 230s at 6 riders. The late 380s crosses in 4/5-rider tests occur too near the 400s cutoff to qualify as 60s sustained passes; recording them as successful would be incorrect. With a tighter 9m starting gap, early first passes occur after 20s.

**Occupied-corridor comparison (3–6 riders):** forcing the blocked right corridor produces **no** rear-on-leader crossing by 400s and records **five aggregate near-halted ticks among unrelated riders** in each test. Choosing the open left corridor yields a sustained pass at **30s** and records **zero unrelated near-halted ticks** under the same scripted demand. The earlier crossing-aware priority-score experiments could not solve this because their collision was already inevitable by the time the rider requested the path.

**Technical safety:** Every 2–6-rider job passed all collision sweeps for all forty steps, never spent negative/nonfinite W-prime, never invented forward distance, reproduced the full state and passing events exactly after a serialized tick-20 checkpoint and was invariant to rider-array ordering for the first tick. Five application/collision jobs succeeded; the production build ran within the 2-rider job. The legacy engine and production result data were not modified. `officialWrites=0`, `sportingApproval=NOT_APPROVED`.

## What the evidence does not prove

This is **small-configuration feasibility** using one **synthetic, unverified 5m road**, one closing-speed/power configuration, four lanes with 1m center spacing, prescribed steering decisions, and no opponent strategy or repeated peloton interactions. The first-pass timestamps and very large final gaps are not historically grounded sporting calibration. No real road widths, missing Guangxi/World Nations ascent, fatigue/weather, synchronized multi-team tactics, finish-line fractional W-prime, competition schedule or 106/168-rider full race were validated.

A corridor-selector seeing an open lane in the current snapshot does **not** guarantee safety in subsequent ticks; the independent actual swept-collision solver continues to enforce clearance. The results do not authorize turning this heuristic on in the canonical race engine.

## Next bounded gate

Run a **road-width and physical-envelope sensitivity matrix** (compact 4m, synthetic baseline 5m, wide 6.5m and cautious 5m) and several relative closing speeds/headways, without introducing clairvoyant target choices. Keep collision checks, W-prime, exact replay and persistent passing across **2–6 riders**. Include dynamic rival lane changes so an apparently open corridor can become blocked later. Require the algorithm to fail safely and protect unrelated riders, not merely pass an easy static open-lane case.

Only after that should early-corridor intent be paired with 12/24/32-rider traffic, meaningful grid perturbations and eventually a full 106/168-rider adapter. In parallel, source actual stage road width, real climb profiles, fractional finish energy and historical realistic breakaway/chase benchmarks.

**A1 technical PASS. A2 sporting NO-GO / OPEN. B/C NOT STARTED.**
