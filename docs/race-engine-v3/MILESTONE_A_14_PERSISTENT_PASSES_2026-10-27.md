# Race Engine V3 — A2 sustained, unique longitudinal passing and grid stability

**27 October 2026. Engineering diagnostic: PASS. Targeted yielding sporting acceptance: FAIL / REJECTED. Production: UNCHANGED.**

## Scope and question

The [previous targeted-yield comparison](MILESTONE_A_13_TARGETED_YIELD_2026-10-27.md) showed that unilateral yielding improves the share of proposed travel accepted in 12/24/32-rider traffic, but sharply reduces tick-to-tick longitudinal crossings. Do those lost crossing events represent unrealistic pairwise oscillation, or genuinely sustained passing opportunities? Does targeted yielding also improve or harm rider-order robustness when only initial lanes change?

The new offline, immutable-physics audit was committed in [`53d2406a`](https://github.com/bracko87/ProPeloton-Manager/commit/53d2406a0a7b56019304111c341e64d92e979125), and the observer's exactly-30-second boundary test was corrected in [`8eb3f93c`](https://github.com/bracko87/ProPeloton-Manager/commit/8eb3f93c557490dde554863a18d8000e8124dcea). No live race engine, canonical micro solver, physics weights, production worker, result table, game clock, or game database was modified.

**Test matrix:** 2 unmodified offline micro solvers (symmetric and targeted) × 3 scenarios (passing corridors, dense following, merging) × 3 starting grids (original, exactly two starting lanes swapped, all lanes shifted by two) × 3 roster sizes (12, 24, 32) = **54 micro simulations**. Each ran 90 ten-second ticks, representing 900 synthetic seconds. These are not complete road stages and do not award finishing classifications.

## Exact measurement definitions

- A longitudinal **crossing event** is a change in strict forward order of two rider centers at consecutive observed tick endpoints, with `epsilon=0.05m`. Pairs with initially tied forward positions are excluded until a strict order exists. Events involving the same pair can recur.
- **Unique crossed pairs** are distinct unordered rider pairs which crossed at least once. A **directional crossing** distinguishes which rider passed which.
- A **30s or 60s sustained event** held the new order for at least that duration before any reverse crossing, including a passage that was subsequently reversed *after* the threshold. A passage too close to the 900s cutoff to observe the whole threshold is right-censored rather than automatically counted as sustained.
- A **quick reversal** is a reverse crossing by the same pair before the indicated duration threshold.
- **Final positional pair inversions** compare each rider pair's strict longitudinal order at tick 90 under different starting grids; this is *not* race classification, true tactical attack or result fairness.
- A uniform two-lane rotation is a symmetry transformation for some of the synthetic layouts. **Its observed zero inversion share is not independent evidence of robustness**; the localized two-rider swap is much more informative.

## Complete technical evidence

[CI full micro audit, all 12/24/32 jobs SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40481189392): passing-observer unit tests, baseline 2D collision and finish tests, original targeted/symmetric micro invariants, exhaustive per-tick swept collision checks, finite nonnegative W-prime, input-array permutation checks, and *exact* JSON checkpoint recovery for both physics and event history. The independent application build passed in the 12-rider CI job.

Archived 30-day full event histories: `v3-a2-persistent-passes-12`, `v3-a2-persistent-passes-24`, `v3-a2-persistent-passes-32`. They include all 54-run grid/mode summaries, unique event records, censored/reversed event duration breakdowns and final rider positions. An initial unit assertion incorrectly excluded a pass that held for *exactly* 30 seconds; this was corrected before any sporting results were accepted.

## Passing corridor — most directly relevant head-to-head metrics

| Measurement | 12 symmetric | 12 targeted | 24 symmetric | 24 targeted | 32 symmetric | 32 targeted |
|---|---:|---:|---:|---:|---:|---:|
| Raw strict longitudinal crossings | 66 | 34 | 205 | 118 | 443 | 192 |
| Distinct unordered crossed pairs | 34 | 30 | 108 | 112 | 213 | 186 |
| Events held at least 30 seconds | **52** | **33** | **177** | **115** | **405** | **189** |
| Events held at least 60 seconds | **45** | **30** | **161** | **112** | **371** | **186** |
| Reversals before 30 seconds | 14 | **1** | 28 | **3** | 28 | **3** |

**Interpretation:** The targeted solver removes the vast majority of rapid pass–repass reversals, which is favorable. But it **also loses 15/49/185 sustained 60-second crossing events** at 12/24/32 riders — about **33.3%/30.4%/49.9% fewer**. This directly rebuts the hypothesis that *all* of its lost crossing activity was merely short unphysical oscillation.

In the 24-rider passing test, distinct unordered pairs that ever cross actually increase 108→112, while total 60s-sustained events decrease 161→112. Unique pairs and sustained events must therefore not be conflated: some pairs repeatedly exchange positions or have different holding intervals. None of these counts alone proves an authentic cycling overtake because the micro-script does not simulate race strategy, aerodynamic drafting, professional road geometry or the finish.

### Two-rider starting lane swap — final 900s positional inversions

| Scenario | 12 symmetric | 12 targeted | 24 symmetric | 24 targeted | 32 symmetric | 32 targeted |
|---|---:|---:|---:|---:|---:|---:|
| Passing corridors | **16.67%** | **40.91%** | **9.78%** | **43.12%** | **16.33%** | **44.35%** |
| Dense following | **0.00%** | **24.24%** | **13.04%** | **41.67%** | **18.75%** | **38.91%** |
| Merging | 48.48% | **0.00%** | 18.12% | **13.04%** | 29.09% | **11.49%** |

A two-rider starting-lane swap is not equivalent to randomizing an entire professional peloton, and synthetic micro positional-order sensitivity is not a historically calibrated tolerance. Nonetheless, the targeted candidate **loses stability very substantially** in passing corridors at all three sizes, even though it improves this specific metric in the merge-pressure scenario. There is no defensible blanket claim that targeted yielding improves sporting fairness.

The two-lane rotation in the passing and dense-follow cases generated identical final positional ordering for both solvers. That uniform transformation is an imperfect robustness challenge, not a supporting positive sporting result.

## Gate decision and next work

**Micro engineering: PASS. Targeted yield sporting gate: FAIL / REJECT.** It remains a separately isolated research-only branch of the micro physics; do not merge it into the canonical coupled full-stage solver or live game. Its smoother flow/low-halt numbers are real within the scripted synthetic scenarios, but they trade off sustained overtaking and amplify the effect of an arbitrary initial two-rider lane swap.

**Next bounded A2 gate:** Develop and verify a **crossing-aware, fair passing priority** research candidate, with a controlled reference to both existing solvers. Restrict passes by a physically safe lateral/longitudinal envelope, but permit riders that have a lasting speed/energy advantage to complete overtakes. Require non-improvised thresholds for sustained-passing retention and starting-grid inversion limits. Use a physically nontrivial fourth starting permutation (not a uniform lane translation), then repeat 12/24/32 tests. **Do not attempt full 106/168 riders until the small-grid candidate passes both mobility and stability.**

Independent blockers still include source-verified road widths, missing 718 m Guangxi and 1,065 m World Nations ascent, historical flat/hilly/mountain racing benchmarks, finite energy at fractional finish ticks, realistic group/breakaway/chase formation, and eventual user-facing tactics integration.

**A1 technically complete; A2 sporting NO-GO; B/C NOT STARTED; official writes 0.**
