# Race Engine V3 — Batch 28: multi-grid robustness and weather-stratified sensitivity

**Date:** 2026-10-26  
**Implementation:** [903b292a174e3fc8724eb87d4b51cd8b3caa74e2](https://github.com/bracko87/ProPeloton-Manager/commit/903b292a174e3fc8724eb87d4b51cd8b3caa74e2)  
**Decision:** **SPORTING NO-GO.** Technical tests and production app build PASSED. OFFLINE-ONLY research. Official race-result writes: **zero**. No production race-engine code, race selector, schedules, results, or game clocks changed.

## Experimental controls

We evaluated the **full 106-rider Dordrecht stage and full 168-rider Guangxi stage** in two already-existing offline V3 configurations: **W-prime energy only** and **W-prime plus anticipatory lanes, path draft and bottleneck telemetry**.

For each race/mode, four neutral-grid conditions with *identical rider attributes, tactics, terrain and power rules*:
1. Original seed `isolated-coupled-batch22`.
2. New deterministic neutral-grid seed `batch28-research-grid-A`.
3. New deterministic neutral-grid seed `batch28-research-grid-B`.
4. Original seed with a **two-rider lane swap within the same neutral starting row** — precisely two lane fields changed; no free longitudinal metres, energy, or speed.

**These are four grid configurations, not four independent randomized seeds.** Roster coverage and non-overlapping starting wheels were checked, as were pairwise finishing order and serialized replay recovery.

A second test used *artificial* +3 m/s headwind and +2 m/s crosswind on every stage segment, comparing the original seed with seed A. These values are **sensitivity assumptions, not historical weather reconstruction**.

Across the four GitHub matrix jobs this produced **24 full-race simulations** (4 calm + 2 wind for each race and mode), plus uninterrupted reference runs used to verify checkpoint restart equality. No state was written to official race tables.

## A — Rank stability across four neutral-grid configurations (calm)

| Race and mode | Different winners | Riders in top 10 in all four grids | Median rider rank range | Maximum rider rank range | Rider-pair inversions against original grid: seed A / seed B | Median absolute finish-time change: seed A / seed B |
|---|---:|---:|---:|---:|---:|---:|
| Dordrecht energy-only (106) | **3** | **0** | **38.5** | **91** | **31.45% / 30.93%** | **217 s / 253 s** |
| Dordrecht combined (106) | 2 | 2 | 10.0 | 45 | 9.40% / 10.96% | 74 s / 87 s |
| Guangxi energy-only (168) | **3** | **0** | **56.0** | **129** | **32.89% / 34.10%** | 160 s / 244 s |
| Guangxi combined (168) | 1 | 2 | 22.5 | 79 | 11.51% / 14.74% | 69 s / 81 s |

A rider's **rank range** is maximum rank minus minimum rank across the four grids. The median rank range therefore describes how far a typical rider moves between *its best and worst grid outcome*, not a standard deviation.

**Result:** the energy-only variant is extraordinarily sensitive to neutral starting positions. The combined model reduces this sensitivity substantially but still changes many placements. In particular, a race can have a stable winner but unstable mid-field order.

### B — Exactly two starting riders swap lanes

This is the most tightly controlled test: the riders exchange lanes at the exact same longitudinal position, retaining their identities, attributes, powers, reserves, tactics, and all other checkpoint fields.

| Race and mode | Changed finishing ranks | Reversed rider pairs | Maximum absolute individual finishing-time change |
|---|---:|---:|---:|
| Dordrecht energy-only | 88 / 106 | 682 / 5,565 | 469.7 sec |
| Dordrecht combined | 88 / 106 | 338 / 5,565 | 317.5 sec |
| Guangxi energy-only | 135 / 168 | 1,373 / 14,028 | 662.9 sec |
| Guangxi combined | 157 / 168 | 1,169 / 14,028 | 273.3 sec |

A small lane-only initial perturbation thus propagates to a broad field-wide change even when the official finishing-gap *tail* sometimes remains unchanged. This supports the need to explicitly control the stochastic / chaotic amplification of positional interactions before sporting adoption; it does **not** establish a correct numerical amount of realistic variation.

### C — Timing of first geometry-defined separations

Here a "first split" is **first sampled 30 m or greater adjacent longitudinal gap** after the lead rider has passed 2 km, while at least 80% of the field is still racing. It is a simple positioning diagnostic, not an official breakaway or group result. Samples are 120 seconds apart.

- Dordrecht energy-only: first sampled split **240 s**; 3–7 geometry-defined groups depending on grid.
- Dordrecht combined: first sampled split **240 s**; 2–5 groups.
- Guangxi energy-only: first sampled split **360 s**; 2–3 groups.
- Guangxi combined: first sampled split **360–480 s**; 2–4 groups.

A large subset of the field is geometrically fragmented very early in these scenarios. Whether 30 m is the correct group threshold needs separate sporting calibration. The first observation is sample-limited, not the true exact instant the gap crossed the threshold.

### D — Artificial wind robustness, original grid against seed A

| Race / mode | Pairwise finish-order inversions | Winner changes? |
|---|---:|---|
| Dordrecht energy-only | 1,836 / 5,565 (**32.99%**) | Yes |
| Dordrecht combined | 810 / 5,565 (**14.56%**) | No |
| Guangxi energy-only | 3,835 / 14,028 (**27.34%**) | No |
| Guangxi combined | 1,552 / 14,028 (**11.06%**) | No |

This is an A/B between **grid seeds under the same artificial wind**, not a causal estimate of wind versus calm. It shows that changing the grid still matters under another power/exposure condition. The spatial motion model does not yet incorporate all real aerodynamic crosswind mechanisms.

## Verification

- [Batch 28 matrix: full-roster grid/wind robustness, statistics invariants, checkpoint equivalence, and application build — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40307508185)
- [V3 legacy isolation and full-race regression — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40307508270)
- Unit regression verifies finish rank permutations, rider roster preservation, no duplicate initial wheels, duplicate/missing results rejected, and no research approval/write gate bypass.
- Full-race test asserts finite W-prime reserves, no repeated attacks beyond the explicit attack command windows, complete finishing rosters, JSON checkpoint round-trip and **exact baseline equality with uninterrupted full-race calculation**.
- The code diff is restricted to `scripts/v3/**` and one `.github/workflows/` definition; **no modifications to `src/race-engine-v3/**`**.

**Evidence:** GitHub Actions preserves four JSON artifacts (`v3-batch28-dordrecht-2000-10-15-energy`, `...-combined`, and corresponding Guangxi reports), retaining every rider's per-grid rank range, top-10 frequency, winners, first splits, group snapshots, passes, blocked steps and finite-energy totals.

## Sporting limitations

- **No measured roster/grid benchmark.** The neutral grids are hypothetical. Four discrete configurations are not enough to estimate real-world outcome distributions or CI intervals. Do not treat a large variance as automatically *physically impossible* without observed comparisons, but the simulated variance is a strong red flag.
- **Guangxi route omits 718 m of reported ascent** in frozen synthetic elevation geometry. This is not yet appropriate for real mountain-race power calibration.
- Dordrecht approximates eight sprint-point tactical commands as normal tempo; source weather, real rider powers, recovery and mass remain uncalibrated.
- A 30 m geographic gap is not a validated racing group. Finish order, temporary split geometry and multi-minute gaps require separate causal explanation.
- Improved combined-mode stability is not approval to run official events. A more stable but systematically unrealistic peloton is still unacceptable.

## Batch 29 proposed engineering action

A **guarded, offline-only initial peloton formation and first-separation stabilization experiment**, not another arbitrary energy coefficient change:
1. Identify the first 30–60 seconds' spatial lane reservations and lane-availability penalties from different starting rows, using equal-watt / equal-effort riders.
2. Test limited rolling-neutral formation convergence **without** teleporting riders, granting extra metres, forcing artificial bunch finish times, or negating realistic attack advantage.
3. Require both **low sensitivity to 2-rider row swaps** and **ability/tactic-sensitive outcomes** across multiple seeds; include weather/grade, realistic first-breakaway formation and group gaps.
4. Preserve swept-corridor collision safety, finite energy accounting, restart determinism, official write isolation, complete existing V3 regression, and production application build.
5. No official V3 activation or race/game-clock operations without explicit sporting approval.

**Batch 28 outcome: diagnosis completed, sporting approval remains BLOCKED.**
