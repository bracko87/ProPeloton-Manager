# Race Engine V3 — Milestone A2 sequential collision-resolution order

**Date: 27 October 2026. Technical stress test: PASS. Sporting acceptance: FAIL / NO-GO.**

## Test purpose

The offline coupled 2D research solver currently processes live riders by descending longitudinal metres, resolving their motion against **already committed swept paths** and other riders whose motion has not yet been processed (provisionally **stationary**). This creates an order-dependent step operator. We must measure its impact, while not confusing a new processing order with physically correct simultaneous movement.

To avoid touching the canonical research solver, commit [`a07ac317`](https://github.com/bracko87/ProPeloton-Manager/commit/a07ac317453e4772bef201a16e6ee9b72b6f2c7e) adds a separate snapshot, `scripts/v3/coupled2DOrderResearchV3.mjs`. Its **default output exactly equals the original solver**, including full-stage results, and only its opt-in priority stress modes differ:

- `front_first`: canonical descending position priority.
- `rear_first`: reverse the rider movement-processing order.
- `alternate_ticks`: front-first on even ticks and rear-first on odd ticks.

These are **diagnostic counterfactuals, not safe tactical fixes**. Crucially, reversing the solver's order changes which cyclists are treated as stationary versus represented by predicted paths; it does **not** independently demonstrate that a simultaneous solver would produce the same outcomes.

## Full-stage results

Both 106-rider Dordrecht and 168-rider Guangxi completed all six full 10-second-step scenarios: three processing orders × original grid or exactly two riders' starting lanes swapped, **12 full stages**. Every variant was collision-checked at continuous within-tick resolution, retained nonnegative energy, completed classifications and reproduced its serialized checkpoint.

| Original-grid metric | Dordrecht front | Dordrecht rear | Dordrecht alternating | Guangxi front | Guangxi rear | Guangxi alternating |
|---|---:|---:|---:|---:|---:|---:|
| Winner | r003 | r003 | r003 | r003 | r003 | r003 |
| Last-rider gap (s) | 1,193.300376 | **1,635.705987** | 1,275.544239 | 1,231.182305 | **2,222.412285** | 1,714.524057 |
| Completed steering maneuvers | **573** | 592 | **13** | **905** | 654 | **92** |
| Aborted steering maneuvers | 264 | 275 | 1 | 279 | 845 | 2 |
| Blocked rider-ticks | 92,768 | 19,650 | 37,565 | 208,287 | 78,020 | 69,704 |
| Sum of modeled mechanical work (J) | 278,831,834.722 | 296,691,297.054 | 291,919,356.204 | 714,467,882.608 | 741,340,807.659 | 742,458,707.446 |

**Sporting stability under the two-rider starting-lane swap:**

| Metric | Dordrecht front | Dordrecht rear | Dordrecht alternating | Guangxi front | Guangxi rear | Guangxi alternating |
|---|---:|---:|---:|---:|---:|---:|
| Changed finishing ranks | 96 / 106 | 103 / 106 | 27 / 106 | 165 / 168 | 165 / 168 | 156 / 168 |
| Inverted rider pairs | 424 | 788 | 44 | 2,603 | 2,433 | 814 |
| Inverted pair share | **7.619048%** | **14.159928%** | **0.790656%** | **18.555746%** | **17.343884%** | **5.802680%** |
| Winner changes | Yes (r006) | Yes (r004) | Yes (r004) | No | No | No |

## Interpretation

**Sequential resolution materially affects outcomes.** It changes finish gaps, rider energy, steering availability and classification response without changing roster, nominal power, route, the 10-second step size, reservation capacity or tactics. However, this is not proof that the *front-first* order alone is the principal defect; the alternative treatments of unsolved stationary bicycles change the interaction rules as well.

**Rear-first is a sporting failure:** the original-grid last-rider gap widens by ~442s Dordrecht and ~991s Guangxi. Dordrecht lane-swap inversion share worsens sharply; rear-first also causes a very high 845 aborted steering maneuvers in Guangxi.

**Alternating order is a deceptive improvement:** rank-pair stability improves in both test fixtures (0.79% Dordrecht, 5.80% Guangxi) but completed steering maneuvers collapse from 573→13 and 905→92 respectively. It drastically changes the modeled ability to pass and spends substantially more mechanical energy across the riders, while original-grid gaps still widen. Small rank changes do not equal believable peloton movement or authentic racing.

The observed decline in blocked rider-ticks under stress orders is therefore **not** a reliable measure of better traffic flow. A code-path with fewer recorded clipping events can be physically less plausible.

## Evidence and isolation

- [GitHub Actions — A2 sequential order stress study: SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40468759427), full Dordrecht and Guangxi CI jobs completed, with exact canonical control equivalence, collision and finite W-prime assertions, complete classifications, mid-stage checkpoint recovery and application production build.
- [Legacy isolation: SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40468759443).
- GitHub Actions 30-day result artifacts: `v3-a2-solver-order-dordrecht-2000-10-15` and `v3-a2-solver-order-guangxi-2000-10-19`, with the full original/swap classifications and per-policy summaries.
- **No canonical offline physics change, live game engine selector switch, production SQL, game clock, official result modifications or player data writes.** The order-stress model resides only in its own research module. `officialWrites=0`; `sportingApproval='NOT_APPROVED'` throughout.

## Next engineering acceptance gate

**The A2 sequential-order sensitivity investigation is complete, but a physically credible correction remains OPEN.** Do not enable rear-first or alternating precedence.

1. Design a **true, simultaneously resolved within-tick motion proposal** in a separate offline solver: every rider's intended trajectory must be computed from the same frozen prior state, followed by collective conflict resolution. Unsolved bicycles must not be treated as permanently stationary for their whole step. Retain strict swept-path collision constraints, energy conservation and deterministic checkpoint replay.
2. Micro-validate multi-rider merging, passing and yielding before full stages. Reject situations with immobilized packs, artificially suppressed steering, unsafe overtakes or negative W-prime.
3. If the micro gates pass, compare 106/168-rider full stages on **at least three independent starting grids**, using pair inversion share, winner stability, actual longitudinal passes, energy, finish gap and authentic breakaway/chase/pack dynamics together.
4. Resolve independent route-fidelity and physics blockers: missing 718m Guangxi and 1,065m World Nations ascent, unverified road widths, calibrated power/weather/tactics and finish-line crossing fractional-tick W-prime.

**Decision: A1 technically passed; A2 OPEN / SPORTING NO-GO; B and C NOT STARTED.**
