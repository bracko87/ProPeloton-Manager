# Race Engine V3 — Batch 33: first positional divergence under paired grid perturbation

**Date:** 2026-10-26  
**Research commit:** [b115b640b658b571420c5f8a7e4f0c0582c400d0](https://github.com/bracko87/ProPeloton-Manager/commit/b115b640b658b571420c5f8a7e4f0c0582c400d0)  
**Decision:** **TECHNICAL PASS / SPORTING NO-GO / OFFLINE RESEARCH ONLY.** Official writes: **0**. No production racing source, selector, game clock, historical results or Supabase changes.

## Question and experiment

Batch 32 demonstrated that changing reservation duration, power expenditure or selection can shuffle most of the final ranking even when just a handful of passes change. This study asks *when* a minimal physical position difference becomes a measurable movement difference, then a wheel-blocking difference, a 30-metre group separation, and finally a new classification.

- Same frozen Dordrecht roster (106 riders) and Guangxi roster (168 riders); two deterministic neutral starting-grid seeds per course: original and `batch28-research-grid-B`.
- Two strictly offline simulator settings: **W-prime energy only** and **W-prime plus the default 3-tick, 35 W finite-passing reservation**. No new race physics is added.
- Initialize two byte-identical coupled V3 checkpoint states, then exchange **only** the lane assignments of two riders in a single equal-distance middle starting row. Keep every rider's metres, critical watts, W-prime, original tactics, attributes, speed, and fatigue identical. Reject swapped positions overlapping any other wheel.
- Advance both states separately **one tick at a time** with identical race inputs, measuring at each tick: same-lane nearest upstream rider ID, per-rider forward metres, changes in cumulative wheel-limited ticks, and adjacent 30-metre spatial gaps. Capture first differences, and samples over the first 30 simulated minutes.
- Continue until every rider finishes, then compare pairwise finish-order inversions, individual finish-time change, winner, tail gap, mechanical work and W-prime. Original-grid unmodified control must exactly match the independently run full race; original-grid perturbed race must also exactly match resumed continuation from a serialized checkpoint at tick 121. Both grids serialize their progress at regular intervals.
- **No hypothetical prescribed group gaps, ability boosts, teleportation, scripted ranks, race writes or live clock changes.**

### Metrics: precisely defined

- **First upstream wheel change:** the earliest tick when the identity of a rider's nearest bicycle ahead in their lane differs. It can occur immediately from the controlled lane swap, without any speed change.
- **First movement difference:** the earliest tick when at least one rider advances a measurably different number of metres in that tick.
- **First material difference:** at least 1 metre of different forward progress **within a tick**. A separate threshold detects 5 metres difference in accumulated position.
- **First blocking difference:** earliest tick when a rider's wheel-limited counter increments in one arm but not the other. This is not the first incident of blocking in either individual race.
- **First group-count difference:** first tick when the two simulations have different numbers of adjacent-position gaps ≥30 metres. This is **not** an official breakaway-group inference and need not coincide with the first moment either arm has two groups.

## Eight paired full-race comparisons

The delta in blocked rider-ticks is **perturbed minus control**. Positive = more accumulated obstruction in the perturbed arm. Each starting-row intervention moves exactly two riders **laterally only**, with zero forward-distance/energy transfer at initialization.

| Frozen fixture | Mode | Grid | First movement | First different blocking | First different 30 m group count | Finish ranks changed | Pairwise inversions | Δ blocked rider-ticks |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Dordrecht 106 | energy | original | 50 s | 50 s | 210 s | 88 | 682 / 5,565 | −3,637 |
| Dordrecht 106 | energy | B | 50 s | 50 s | 190 s | 95 | 1,320 / 5,565 | −52 |
| Dordrecht 106 | finite pass | original | 50 s | 50 s | 220 s | 97 | 646 / 5,565 | +4,293 |
| Dordrecht 106 | finite pass | B | 50 s | 50 s | 190 s | 99 | 1,127 / 5,565 | +3,384 |
| Guangxi 168 | energy | original | 70 s | **2,390 s** | 2,420 s | 135 | 1,373 / 14,028 | −11,834 |
| Guangxi 168 | energy | B | 60 s | 60 s | 390 s | 153 | 2,311 / 14,028 | +12,491 |
| Guangxi 168 | finite pass | original | 70 s | **5,750 s** | 5,810 s | 117 | 755 / 14,028 | +4,331 |
| Guangxi 168 | finite pass | B | 60 s | 60 s | 270 s | **165** | 2,060 / 14,028 | +5,084 |

For Dordrecht both energy and passing studies change the nearest upstream wheel on **tick 1 (10 seconds)**, but their first forward-motion divergence occurs **tick 5 (50 seconds)**; a 1-metre single-tick movement difference appears at **60 seconds**. Different geometric group counts appear by **190–220 seconds**.

### Most important insight — Guangxi original grid

The two swapped riders begin moving differently after **70 seconds**, and at least one achieves a 1-metre within-tick difference after **80 seconds**. Nevertheless, the first **differently blocked rider** is not recorded until **2,390 seconds** in energy-only mode or **5,750 seconds** with finite passing; different 30-metre group counts arise at **2,420** and **5,810 seconds** respectively.

Despite these delayed blocking and group-count divergences, **135** (energy-only) and **117** (finite passing) of the 168 riders change finishing rank, with 1,373 and 755 rider-pair inversions respectively. This **rules out the claim that an immediate different wheel-blocking event always drives ranking instability**. It does **not** prove the exact alternative mechanism: altered shelter, lane occupancy, power, W-prime recovery, or later spatial interactions may be contributing. The observed data are deterministic and descriptive.

### Alternate starting seed changes the diagnosis

In Guangxi grid B, first motion and different blocking both occur at **60 seconds**, with group-count divergence after **390 seconds** in energy mode and **270 seconds** with finite passing. The same kind of two-wheel start perturbation now affects **153** and **165** finishing ranks, and blockage can increase rather than decrease. This is inconsistent with a globally predictable response to the same policy.

## Technical evidence

- [Batch 33 four-job matrix: paired full-roster simulations, lane-swap invariants, serialized replay and application build — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40318787018)
- [Existing V3 legacy-isolation suite, all 51 workflow steps complete — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40318786968)
- No TypeScript/physics module or production entry point was changed by this batch; only three offline scripts and their dedicated workflow were added.
- Four GitHub Actions JSON artifacts are retained for 30 days: `v3-batch33-dordrecht-2000-10-15-energy`, `v3-batch33-dordrecht-2000-10-15-finite_pass`, `v3-batch33-guangxi-2000-10-19-energy`, and `v3-batch33-guangxi-2000-10-19-finite_pass`. They contain the exact tick events, first-180-tick observations, both complete rider finishing classifications, checkpoint status, W-prime and blocking totals.

## Research constraints and next acceptance gate

1. **No causal attribution yet.** The nearest-wheel heuristic is an observation on initial same-lane positions. It is not an instrumented explanation from within the spatial solver's clipping branch, nor a full aerodynamic exposure decomposition.
2. The starting-grid swap is synthetic. The current solver uses discrete integer lane occupancy, not measured cyclist body positions or interpolated steering.
3. A gap ≥30 metres is a geometric statistic, not an official time-gap/breakaway classification. Quantifying actual first meaningful separation needs a calibrated peloton group model and observed racing.
4. Guangxi's synthetic climbing geometry still omits **718 m of reported ascent**, and Dordrecht eight sprint-points tactical orders remain mapped to tempo. These problems prevent real-world sporting calibration.
5. **Batch 34 proposal:** instrument, strictly offline, the *per-rider first motion constraint* with source-of-power breakdown (available watts, aerodynamic shelter, slope, requested metres, clipped metres, nearest leading wheel) and the *energy change on the same tick*. Separate the effects of different drag/draft from blocking; test a minimal, source-driven change only once causal traces are stable across both grid seeds. Maintain zero writes, exact checkpoints, full V3 regression and app build.

**Sporting decision: NO-GO.** Do not enable official V3, recalculate historical race outcomes, or alter live race clocks.
