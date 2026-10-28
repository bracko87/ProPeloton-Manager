# Race Engine V3 — Milestone A Step 49: common-physical-reference comparison and direct pair contacts

**28 October 2026 — OFFLINE technical PASS, 600/600 physical runs; no sporting or numerical convergence approval.**

## Why the comparison method needed correction

A47 compared each candidate policy's 1/2/2.5/5-second result to **that policy's own 0.5-second simulation**, which is useful for detecting within-policy timestep dependence. A48 found that **9/11** reported fixture-level "regressions" against A44 did not reflect differing coarser-step paths at all: the coarser results were identical and only the policies' independent 0.5-second references differed.

This means a smaller **own-reference** error cannot by itself be interpreted as a superior overtaking decision or actual physical convergence. Nor can it make a 0.5-second result an authoritative real-race reference.

Step49 adds three mutually clarifying comparisons without modifying the collision or energy model:

1. **One shared A44 0.5-second physical reference per fixture.** Every policy at every physical grid is compared to precisely the same rider snapshot, using the same rider identities, initial conditions, commands, energy and geometry.
2. **One shared A46 0.5-second reference per fixture**, to expose how anchor choice changes absolute errors, inversion totals and rankings. Neither computed reference has been calibrated as cycling truth.
3. **Direct policy-against-policy comparison on the same physical grid**, requiring actual x/y/leader-gap/W-prime/rider-order differences rather than relying on a change in self-comparison scores.

A separate A48 geometric observer captures actual first 2D swept contact time, lateral steering direction and whether a leading rider would cross the corridor of a completely stationary trailing rider.

## Isolated implementation and evidence

Research-only files:

- `scripts/v3/a2CommonReferenceAuditV3.mjs`: pure validated snapshot comparison, with strict ID matching, finite numeric fields, maxima, RMS position errors, mean absolute position differences, leader-gap/W-prime errors and pairwise positional order inversions; supports one explicitly labeled shared anchor and direct same-grid policy-to-policy comparison.
- `scripts/v3/verify-a2-step49-common-reference-v3.mjs`: reproduces the original 40 fixture configurations and tests both shared anchors against every grid and three unchanged physics policies. Records direct comparisons, individual cases and detailed causal spotlights.
- `.github/workflows/v3-a2-step49-common-reference.yml`: GitHub research run with saved complete JSON and separate A48–A39 / stage regression + production build jobs.

[Step 49 GitHub Actions](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40658463253) tested **40 configurations × 3 unchanged policies × five physical steps = 600 full 60-second technical simulations**, including actual swept-safety checks, exact JSON midpoint restart/replay, energy conservation, finite nonnegative W-prime and immutable rider commands. There are **200 fixture-grid common-reference comparison groups** (40 fixtures × 5 grids) and four detailed pair-contact spotlights. All official-write counters remained zero. The previously established rider-ID/mirror invariance tests are rerun by existing versioned regressions. This study **does not** evaluate real 106/168-rider full pelotons or source-calibrated stages.

## Common A44 0.5-second anchor: measured numerical error

The same fixed **A44 rear-priority 0.5s** reference is used for all three policies in every entry.

| Tested physical step | Policy | Worst rider x deviation | Worst leader gap deviation | Positional rider-pair inversions (total) |
|---|---|---:|---:|---:|
| 1s | A44 rear | 103.667m | 103.679m | 347 |
| 1s | A46 two-sided | 102.189m | 102.202m | 276 |
| 1s | A47 leader-only | **79.906m** | **80.006m** | **270** |
| 2s | A44 rear | 143.535m | 143.648m | **429** |
| 2s | A46 two-sided | 112.428m | 112.541m | 462 |
| 2s | A47 leader-only | **105.004m** | **105.116m** | 447 |
| 2.5s | A44 rear | **166.014m** | **166.627m** | 511 |
| 2.5s | A46 two-sided | **166.014m** | **166.627m** | 520 |
| 2.5s | A47 leader-only | 173.886m | 174.498m | **488** |
| 5s | All three policies | **136.865m** | **133.978m** | **608 (identical)** |

There is no consistent winner across every physical grid and every metric, and deviations remain tens or hundreds of metres after just 60 simulated seconds. **These numbers fail physical convergence and sporting plausibility gates.**

## Does changing the shared reference alter the conclusion?

Using the **A46 two-sided 0.5s reference instead**, the aggregate inversion totals change:

| Physical step | A44 rear | A46 two-sided | A47 leader-only |
|---|---:|---:|---:|
| 1s | 327 | 256 | 250 |
| 2s | **413** | 446 | 431 |
| 2.5s | 491 | 500 | **468** |
| 5s | **592** | **592** | **592** |

The **aggregate inversion-based policy ordering** under these two particular choices remains the same in this limited dataset; no statistically robust or real-world generalization follows. These shared references are explicitly labeled **UNVALIDATED_COMPUTATIONAL_ANCHORS**. Selecting A44 or A46 as ground truth would be circular. The separate root problem—time-step dependence of 2D contact resolution—remains unresolved.

## Direct same-grid paths — decisive sanity check

The count of 40 synthetic fixtures in which **A44 and A47 have completely identical accepted final rider trajectories**:

| Physical step | Identical A44 vs A47 fixtures | Direct same-grid rider-pair order reversals, summed |
|---|---:|---:|
| 0.5s | 32 / 40 | 90 |
| 1s | 37 / 40 | 93 |
| 2s | **39 / 40** | 62 |
| 2.5s | 38 / 40 | 95 |
| 5s | **40 / 40** | **0** |

At **5 seconds**, the original A44, A46 and A47 policies produce **identical final physical rider trajectories in all 40/40 fixtures**. Direct same-grid rider-pair reversals are **zero** between all three policies, while the previous *own-reference* experiment reported 608, 592 and 570 inversions respectively. Those different earlier totals were purely a consequence of comparing the **same** coarse physical outcomes against **three different 0.5-second references**. They must not be presented as evidence that A47 improved actual 5-second racing over A44.

The same-grid observations also reveal 29 nonreference fixture/quantum combinations where the A44 and A47 coarser-grid result is identical but their within-policy fine-reference score differs. This includes the nine previously identified A48 regression examples; those 29 combinations are not all regression cases.

## Four source-level causal spotlights

Each spotlight is matched to the previously observed first accepted trajectory divergence. Times below are the **first accepted substep end**, not absolute initial predicted contact timestamps.

| Physical scenario | First differing accepted time | First differing rider | Important source pair / geometry |
|---|---:|---|---|
| Baseline 5m, 8 riders, v1, 0.5s | **51.0s** | r005 | r004 physically ahead, steering toward r005; first contact fraction **0.052632**; r004/r005 initial x gap **1.574869m**; moving leader intersects stopped follower |
| Wide 6.5m, 8 riders, v1, 0.5s | **51.5s** | r005 | Same r004/r005 unilateral steering pattern; first contact fraction **0.105263** and start gap **1.074869m** |
| Cautious 5m, 32 riders, v0, 2.5s | **22.5s** | r025 | At least **two simultaneous provisional conflict pairs**: r017/r020 unilateral steering with stopped-follower overlap (contact fraction **0.052632**), plus r023/r030 steering (fraction **0.359995**) |
| Cautious 5m, 32 riders, v1, 2s | **22.0s** | r021 | **Five concurrent pair conflicts**, including straight, unilateral and parallel steering; pair r021/r024 has a moving leader crossing the follower (fraction **0.065789**) |

The 32-rider v0 first diverging r025 is **not necessarily a member of the initial listed colliding pairs**. The graph of simultaneous conflicts and changed moving rivals can spread decision effects beyond the first preview contact. This is why a local "rear cyclist always yields" rule cannot be established from one highlighted pair.

The 8-rider examples show a real difference in **fine-grid** accepted rider motion when a leader steers across an already close trailing rider. The 32-rider examples show real **coarser-grid** divergence at 22–22.5 seconds. These represent two different root investigations, not proof that either available policy is correct.

## Decision and next work

**A49 double common-reference, direct same-grid physics comparison, frozen first-contact evidence, technical sweep safety, energy and exact restart PASS.**

**A2 numerical convergence and sporting authenticity NO-GO.** Different policies' own-reference inversion totals must not be confused with actual differences in the same accepted race. No policy is promoted based on these results. The 0.5-second reference is a computational comparator, not independent field-tested cycling physics.

**Step A50:** design explicit pairwise physical right-of-way/contact-time invariants and a **common time-consistent contact model** under frozen rider intents. First check r004/r005 at 51/51.5 seconds and the cautious-5m 32-rider conflict graphs at 22/22.5 seconds. Only then judge a candidate on shared-reference and direct pair metrics, controlled steering intentions, true swept safety, W-prime and deterministic replay. Full 106/168-rider scale, road-width/elevation provenance and sporting-drafting calibration remain outstanding.

**Milestones B/C NOT STARTED. No production race selector, live results, Supabase, payouts, player currencies or game-clock changes.**
