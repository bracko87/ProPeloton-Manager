# Race Engine V3 — Milestone A2: bounded crossing-aware yielding with a fourth starting grid

**27 October 2026 — micro engineering PASS; candidate non-operative / sporting NO-GO.**

## What changed

After the [54-case sustained-passing study](MILESTONE_A_14_PERSISTENT_PASSES_2026-10-27.md), the current unilateral targeted resolver had been rejected for sporting use: it greatly improved aggregate movement but reduced many 60-second sustained overtakes and amplified the outcome of swapping two riders' starting lanes.

A separate **offline-only** research fork adds a bounded hypothetical protection for a closing rearward rider. Protection requires an initial headway between **1.8 and 18 metres**, a proposed rear-rider crossing margin of at least **2 metres**, and **distinct intended lateral corridors**. Within an already swept-collision-safe choice set, it adds a maximum *scoring cost* of 10 metres for yielding the protected rear rider. It does **not** force the pass, relax lane geometry, bypass collision tests or alter power, W-prime, riders or the canonical live race engine. The research fork is `scripts/v3/simultaneousCrossingAwareResolveV3.mjs` with `simultaneousCrossingAwareMicroV3.mjs` and dedicated micro safety checks.

Technical source commits: [bounded prototype](https://github.com/bracko87/ProPeloton-Manager/commit/c794951b867edb8aab8bacee173523aa1adac32f), [108-run four-grid screen](https://github.com/bracko87/ProPeloton-Manager/commit/78eea838ac5cac99ad13865b5df896711e47888b), and [valid adjacent-lane test fixture](https://github.com/bracko87/ProPeloton-Manager/commit/1005dc7604f02150cb329b5cce2175c32f25a447).

The new **nonuniform fourth grid** swaps lane assignments for adjacent riders on every second starting row, instead of rotating every rider by the same amount. All scripted rider forward demands, power and tactics stay fixed; the new grid's motion requests are bounded to adjacent-lane changes only. The first CI run correctly identified invalid instructions that jumped more than one lane. That test-fixture defect was fixed without changing physics, then all jobs passed.

## Full technical evidence

[GitHub Actions — four starting grids, all three jobs SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40483048092).

The full audit covered **3 distinct offline micro solvers** (symmetric, original targeted, new crossing-aware) × **3 synthetic traffic situations** (passing corridors, dense following, merging) × **4 starting grids** (original, first two lanes swapped, uniform two-lane rotation, nonuniform alternating-row swaps) × **3 roster sizes** (12, 24, 32) = **108 scenarios**. Each ran 90 ticks of 10s for 900 simulated seconds.

Every successful case passed per-tick swept collision checks, finite W-prime, deterministic solver and overtaking-event checkpoint replay, and rider input-order invariance. Each size retains full per-pair events and four-grid evidence in the 30-day GitHub artifacts `v3-a2-crossing-aware-grid-12`, `v3-a2-crossing-aware-grid-24`, and `v3-a2-crossing-aware-grid-32`.

## Actual policy activation: no change at all

The research counter saw prospective protection conditions on the **original-grid passing-corridor scenario**, but the bounded preference **never changed any chosen yielding decision**, in any of the three roster sizes:

| Measure (original passing corridors) | 12 riders | 24 riders | 32 riders |
|---|---:|---:|---:|
| Proposed protected-conflict edges | 8 | 19 | 19 |
| Actual changed unilateral-yield decisions | **0** | **0** | **0** |
| Candidate 60s sustained passes | 30 | 112 | 186 |
| Existing targeted 60s sustained passes | 30 | 112 | 186 |
| Original symmetric 60s sustained passes | **45** | **161** | **371** |

The identical crossing-aware and targeted outcomes are a **measurement**, not an improvement: the new preference is *non-operative* in the tested conditions. The data cannot distinguish whether only one unilateral option was geometrically feasible, whether both options existed but their sacrificed-distance difference exceeded 10m, or whether another interaction prevented any effect. These are the next diagnostic questions; arbitrarily raising the weight to force a difference is **not** justified.

## Starting-grid stability — positional inversion share at 900 seconds

These are **not** full-stage finishing classifications. They measure reversed final longitudinal order under an otherwise identical synthetic scenario.

| Passing corridors — perturbation | Symmetric (12 / 24 / 32) | Crossing-aware (12 / 24 / 32) |
|---|---|---|
| Two starting riders swapped | **16.67% / 9.78% / 16.33%** | **40.91% / 43.12% / 44.35%** |
| Nonuniform alternating-row swaps | **6.06% / 31.88% / 26.81%** | **30.30% / 29.35% / 27.42%** |

The nonuniform fourth grid adds useful evidence, including worse crossing-aware stability for 12 riders and very similar but still unsettled effects for 24/32. The earlier uniform two-lane rotation is frequently a geometric symmetry that yields zero inverted pairs and should **not** count as a robust independent fairness test.

### Declared research screens (not historical sporting standards)

Before the final run, the script required the crossing-aware candidate to retain **at least 85%** of symmetric 60s sustained crossing events, remain within **5 percentage points** of symmetric two-rider-swap inversion share, and retain targeted movement efficiency to within **3 percentage points**. All three sizes **passed flow retention** but **failed both sustained-pass retention and swap stability**.

| Screen | 12 riders | 24 riders | 32 riders |
|---|---|---|---|
| Minimum 60s passing retained | FAIL (30 vs required 39) | FAIL (112 vs required 137) | FAIL (186 vs required 316) |
| Two-rider swap grid stability | FAIL (40.91% vs max 21.67%) | FAIL (43.12% vs max 14.78%) | FAIL (44.35% vs max 21.33%) |
| Preserve targeted movement | PASS | PASS | PASS |

These thresholds are deliberately declared *research rejection filters*, not calibrated acceptance criteria for professional cycling.

## Decision and next bounded gate

**Technical: PASS. Sporting candidate: FAIL / REJECT.** A scoring rule which never changes an actual conflict resolution cannot address the observed deficit of sustained passes or starting-grid instability. Do not switch the game to this candidate or move it into the canonical full-stage coupled 2D solver.

**Next:** instrument the unilateral decision option set itself: number of first-proposal collisions, pairs with zero/one/two feasible yield choices, margins of sacrificed metres, and whether riders have genuine physically separated lateral corridors. Use that to select a geometrically valid passing mechanism rather than adjusting scoring heuristics blindly. In parallel, tackle the independent sporting blockers — missing **718m Guangxi** and **1,065m World Nations** ascent, source-verified road widths, fractional-tick finish energy accounting and authentic group/breakaway/chase benchmarks. Full 106/168-rider sporting promotion remains blocked.

**A1 technically passed; A2 sporting NO-GO; B/C NOT STARTED; official game writes 0.**
