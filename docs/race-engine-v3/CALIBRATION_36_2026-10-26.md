# Race Engine V3 — Batch 36: frozen-energy aerodynamic demand vs lane-reservation factorial

**Date:** 2026-10-26
**Research code:** [20d36bf7](https://github.com/bracko87/ProPeloton-Manager/commit/20d36bf7b0afd78b0d3d7ead3767eedb46d5ff4c), [69403ccb](https://github.com/bracko87/ProPeloton-Manager/commit/69403ccbe2a0e036ee38e1cddd4723c2d2b4c328), [6dbef739](https://github.com/bracko87/ProPeloton-Manager/commit/6dbef739289906f297d1e3603d02775f0ae50bb4).
**Decision: ENGINEERING PASS / SPORTING NO-GO / OFFLINE ONLY.**
**Scope:** New diagnostic scripts and their CI workflow only. No `src/race-engine-v3/**`, production selector, race calculation, scheduler, database, or game-clock modifications. Official writes: **zero**.

## Motivation and intervention isolation

Batch 35 established that changing drafting strength throughout an interactive race changes both its power demand and its future wheel environment. It cannot establish the separate contribution of each. Batch 36 instead evaluates **independent counterfactuals from the identical recorded pre-tick state** and records their immediate movement, without allowing their alternative states to change later race physics.

Each sampled checkpoint holds fixed **all original riders' longitudinal metres, lanes, incoming speed, fatigue and W-prime reserve, available mechanical watts, stage weather/grade, and tactics**. It compares:

1. **Same achieved motion, alternate drafting work** — calculate actual mechanical work over the unchanged displacement at 0%, 50%, 100% of *path-integrated* shelter. This is a pure one-step cost function; energy is **not debited** in the factual replay.
2. **Same energy/position, alternate speed choice** — compute instantaneous desired speed from exactly the same recorded available watts and W-prime checkpoint, but with observed start shelter multiplied by 0%, 50%, 100%; then apply the **unchanged** spatial collision solver for one isolated tick. The 100% arm must reproduce the original commanded/achieved movement, wheel-limited flags and end positions exactly. No adjusted energy is carried to the next checkpoint.
3. **Same speed command and W-prime, alternate lane occupancy** — when a pair of riders begins at exactly the same row metres in separate lanes and passes clearance validation, swap **only** those two lane numbers and run one isolated physical step using the original unmodified requested speeds. The swap must undo to an **identical** initial state. No free forward metres, no permanent assignment, no modified watts.
4. All factorial interventions are **single-tick causal probes**, not separately evolved full races. Full-stage outcomes come exclusively from the untouched baseline V3, for context and exact serialized restart verification.

## Scope and reproducibility

- Dordrecht 106 riders and Guangxi 168 riders, energy-only and default three-tick finite passing, 3 deterministic neutral grids, two profiles: frozen synthetic weather and artificial +3 m/s headwind / +2 m/s crosswind.
- **24 complete unchanged coupled V3 reference races**, all validated to finish and write no official results. One original-grid baseline per fixture/mode checks exact equality with uninterrupted `runCoupledV3`; **all 24** complete races must equal continuation from their JSON-serialized state after the first **96 ten-second ticks (960 simulated seconds)**.
- The first 96 ticks of all 24 reference races are sampled, with three aerodynamic speed-choice arms and safety-checked same-row lane-swap attempts. Each full-roster snapshot must reproduce the existing physical solver; incomplete or mismatched rider observations fail closed.
- Reordered input-row tests require stable results within numeric floating-addition tolerance; output positions and baseline-state equality are exact.
- Full rider classifications, frozen energy/collision metrics, group geometry, artificial weather and pre-tick counterfactual observations are preserved in per-matrix-job JSON.

## Baseline original grid, first 960 seconds: frozen physical comparisons

**Mechanical-work figures are additional aggregate field work at identical achieved speeds with no shelter versus original observed path-integrated shelter.** They are not rider-specific consumption or differences in whole-race energy.

| Fixture and mode | Fixed-motion extra work at 0% shelter | Changed rider-tick speed requests at 0% shelter | Changed rider-tick achieved movement at 0% shelter | Safe same-row lane swap opportunities / immediate movement changes |
|---|---:|---:|---:|---:|
| Dordrecht, energy-only | **+3.526 MJ** | 7,800 / 10,176 | 6,575 / 10,176 | 6 / 8 rider-ticks |
| Dordrecht, finite passing | **+3.336 MJ** | 8,103 / 10,176 | 7,614 / 10,176 | 6 / 8 rider-ticks |
| Guangxi, energy-only | **+7.589 MJ** | 14,341 / 16,128 | 11,653 / 16,128 | 6 / **0** rider-ticks |
| Guangxi, finite passing | **+7.573 MJ** | 14,293 / 16,128 | 11,548 / 16,128 | 6 / **0** rider-ticks |

The per-rider energy reserve and positions were identical when computing the alternative demanded velocities. Thus aerodynamics directly changes *desired* and often *achievable* next-tick movement even without earlier changes in energy. The lane-only test produces very few eligible equal-row swaps beyond initial grid structure, so **these unequal intervention opportunities must not be interpreted as proving that lane geometry is unimportant**.

## Synthetic wind contrast, original grid

| Fixture / mode | No-draft extra work, same motion | Changed demands at 0% shelter | Changed achieved movement | Safe row swaps / immediate movement changes |
|---|---:|---:|---:|---:|
| Dordrecht, energy | +3.214 MJ | 8,085 | 6,926 | 4 / 8 |
| Dordrecht, finite passing | +2.798 MJ | 8,388 | 7,789 | 4 / 8 |
| Guangxi, energy | +6.822 MJ | 14,720 | 12,244 | 4 / 0 |
| Guangxi, finite passing | +6.822 MJ | 14,676 | 12,142 | 4 / 0 |

Wind is an artificial test condition, **not historical observed stage weather**. The 50%-shelter arm is retained in complete JSON. Some 0%-shelter counterfactuals change wheel-limited *flags* as well as desired speed even though original W-prime and positions are frozen. As expected, an attempted same-row lane swap is not an aerodynamic demand intervention.

## Whole-race contextual grid sensitivity — UNCHANGED physics only

The 24 complete reference races are **not simulations of the one-tick counterfactuals**. They provide the remaining sporting-quality warning while checking the exact original engine outputs.

| Frozen route / mode | Calm: grid A / B inverted rider-pair share | Artificial head/crosswind: grid A / B |
|---|---:|---:|
| Dordrecht, energy | 31.45% / 30.93% | 32.99% / 40.52% |
| Dordrecht, finite passing | 38.06% / 36.19% | 34.27% / 49.45% |
| Guangxi, energy | 32.89% / 34.10% | 27.34% / 37.92% |
| Guangxi, finite passing | 30.82% / 33.84% | 29.48% / 35.09% |

Many relative finishing positions remain dependent on synthetic starting-grid assignment, regardless of the fact that these paired stage inputs keep rider skills, W-prime limits and commands the same. This is still a **sporting NO-GO**.

## CI and source integrity

- [Batch 36 full-roster four-job factorial, pure invariants, exact baseline mechanics, serialized restarts and application build — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40328999031).
- [Existing V3 isolation and regression suite — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40328999071): **51 steps, zero failed steps, no GitHub `##[error]` entries**, independently checked in job logs.
- The legacy regression *correctly* labels the World Nations Hilly/Mountain source route **`routeFidelity: FAILED`**: 720 m represented vs 1,785 m declared, 1,065 m missing, sporting activation blocked. It is a known **sporting-data blocker**, not a failed CI step. Guangxi's synthetic climbing profile separately misses 718 m.
- Four GitHub Actions artifacts, 30-day retention: `v3-batch36-dordrecht-2000-10-15-energy`, `v3-batch36-dordrecht-2000-10-15-finite_pass`, `v3-batch36-guangxi-2000-10-19-energy`, `v3-batch36-guangxi-2000-10-19-finite_pass`. Each contains three control-grid runs in two weather modes, full finish rows, counterfactual immediate movement summaries and saved trace slices.
- Early testing identified an assertion that incorrectly required floating-point **summation** order to be bit-identical under rider-row permutation; changed to a tightly bounded tolerance while retaining exact movement and rider-state checks. Also patched the study's replay adapter to preserve the existing three-tick pending pass's `recover` spatial tactic and delayed lane commit; **not a solver fix**. After these test-harness changes, all final matrix jobs passed.

## Interpretation and Batch 37

1. **One-tick aerodynamic speed-response effect is demonstrated in the provisional model**, at matched energy and positions. Aerodynamic cost at identical achieved motion is also measurable.
2. **Causal importance for final finishing order is not identified yet**. The lane-swap treatment samples only rare, exact equal-row exchanges; it does not randomize collision priority, continuous lateral trajectories or multi-tick wheel order. Do not compare its treatment frequency against full-field drag removal as an unbiased importance estimate.
3. No controlled experiment changes **actual historical data**, riders' real CdA values or a measured race route; no parameter can pass sporting validation on these synthetic comparisons alone.
4. **Batch 37 recommendation:** Test precise nearest-wheel and same-lane reservation-order events, using many equated-power, same-shelter trajectories and safe *adjacent-lane* alternatives, not just equal-row lane swaps. Decompose lost metres at the first obstruction and whether the first 30-metre group gap is geometrically inevitable. Extend to multiple grades, density, crosswinds and route-fidelity-corrected source stages. Keep NO-GO and use safe bounded maneuvers with no instant longitudinal distance grants.

**Status: ENGINEERING PASS, SPORTING NO-GO, OFFLINE ONLY.** Default V3 physics, production racing selection, database, player results and game clock remain untouched.
