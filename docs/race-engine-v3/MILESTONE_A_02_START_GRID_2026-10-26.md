# Race Engine V3 — Milestone A2: starting-grid bias and simultaneous passing capacity

**Date:** 2026-10-26
**Milestone:** A2, sporting stability, **OPEN / SPORTING NO-GO**.
**Engineering experiments:** two full-stage matrices, **12 complete 2D offline races** (8 equal-position tie priorities, 4 capacity-three trials), all complete and checkpoint-reproducible.
**Production writes:** **0**. Existing official engine, historical race tables, clock, Netlify racing selection and Supabase unchanged.

## What was tested — targeted causes, not another unstructured batch

The Milestone A1 experiment found that changing the starting lanes of only two equal-row bicycles altered 102/106 finishing ranks in Dordrecht and 163/168 in Guangxi. We tested two distinct, conservative research interventions:

1. **Equal-position arbitration only:** replace lexical rider-ID tie-breaking for bicycles with exactly the same forward metres by a fairer deterministic, rotating-lane priority. No change in positions, requested power, road width or passing capacity. Four complete experiments per fixture: original/swap × existing/rotating priority, with all rider result rows and checkpoint states preserved. The original policy and explicit historical baseline produced the *exact previously verified winners and finishing seconds*.
2. **Finite safe overtaking capacity only:** preserve all original 2D physics, continuous collision tests, W-prime debit, 5 m hypothetical road width, 2 reaction/3 steering ticks and source rider skills; increase the concurrent passing reservation cap from **two to three**. Run complete original/swap 106- and 168-rider stages and recover exactly from a serialized 40%-stage checkpoint. Compare with the unchanged capacity-two full-stage evidence.

Each changed research parameter remains entirely opt-in and offline. No alternative race calculation enters the gameplay selector or writes a player result.

## The underlying bias is strong

In the previously verified steering-enabled **original grids**, starting ordinal and finishing rank have Pearson correlations:

| Fixture | Starting order ↔ finishing rank | Start ordinal ↔ rider critical power | Start ↔ finish, adjusted for modeled CP |
|---|---:|---:|---:|
| Dordrecht (106) | **0.915** | −0.187 | **0.913** |
| Guangxi (168) | **0.781** | −0.226 | **0.776** |

Positive values mean riders at the front tend to finish at the front. The start-order correlation remains strong after linear adjustment for modeled critical power. This is **diagnostic association, not proof of sole causality**: attributes, identity-based initial tactics, geometry and effects of early blocked positions can interact. The initial four-abreast rolling grid is synthetic, not an authenticated historic placement.

Dordrecht's first 26 starting riders contributed **19 of the first 26 finishers** in the steering-enabled control. Such persistence indicates serious artificial-order bias; ordinary strong riders near the front only partially explain it.

## Experiment 1 — rotating equal-position tie priority

**Result: no effect on full race outcomes**. Both original and lane-swapped experiments reproduced all rider finishing classifications exactly relative to the existing fixed-ID policy:

| Metric after swapping two lanes | Rider-ID tie order | Rotating lane tie order |
|---|---:|---:|
| Dordrecht riders whose finishing ranks change | 102 / 106 | 102 / 106 |
| Dordrecht reversed rider pairs | 746 / 5,565 (13.405%) | 746 / 5,565 (13.405%) |
| Guangxi riders whose ranks change | 163 / 168 | 163 / 168 |
| Guangxi reversed rider pairs | 3,925 / 14,028 (27.980%) | 3,925 / 14,028 (27.980%) |

No winner, finishing time or finish row changed between the two priority policies in **any** of the four paired conditions. Therefore the historical tie-break is **not a material driver** of the observed extreme start-grid problem in these two fixtures. **Do not promote this ineffective setting.**

## Experiment 2 — up to three simultaneous overtaking reservations

| Metric | Dordrecht cap 2 | Dordrecht cap 3 | Guangxi cap 2 | Guangxi cap 3 |
|---|---:|---:|---:|---:|
| **Inverted rider-pair share** between original and swapped grid | 13.405% | **7.619%** | 27.980% | **18.556%** |
| **Changed finishing ranks** | 102 / 106 | 96 / 106 | 163 / 168 | 165 / 168 |
| Winner changed by two-rider lane swap | Yes | Yes | Yes | **No** |
| Original-grid winner | r004 | r003 | r013 | r003 |
| Original-grid blocked rider-ticks | 98,649 | **92,768** | 211,989 | **208,287** |
| Original-grid completed lateral reservations | 414 | **573** | 613 | **905** |
| Original-grid last-rider gap | **974.790 sec** | 1,193.300 sec | 1,130.839 sec | **1,231.182 sec** |

**Measured improvement:** relative pair-inversion share falls **43.2% Dordrecht** (−5.786 percentage points) and **33.7% Guangxi** (−9.424 percentage points). Additional, strictly collision-checked passing opportunities contribute to a more stable pairwise classification across these two starting grids.

**Important regression:** although blocked rider-ticks fell, the last-rider gap in **both original-grid races became larger**. Dordrecht's tail gap grows by about **219 seconds** and Guangxi's by **100 seconds**. Also 96/106 and 165/168 riders still move to different finishing ranks, and Dordrecht's winner still flips after the two-rider lane swap. Therefore **three reservations is an informative candidate but NOT a sporting-approved global fix**. Do not describe improvements in blocked ticks as improved realistic gaps.

Original-grid capacity-three full-stage examples:
- Dordrecht: winner **r003** in **11,940.508 sec**; tail gap **1,193.300 sec**, 837 passing attempts, 573 completed; swapping first two lanes yields winner **r006** in 11,933.876 sec, tail gap 1,202.394 sec, 424 rider-pair inversions.
- Guangxi: winner **r003** in **17,566.271 sec**; tail gap **1,231.182 sec**, 1,184 passing attempts, 905 completed; swapping first two lanes yields the **same winner r003** in 17,596.248 sec, tail gap 1,162.340 sec, 2,603 rider-pair inversions.

Each full race includes 106/168 unique, finite finish times, no invalid collision resolution, no W-prime overdraw, and exact JSON recovery from mid-race. The cap-three model is a distinct experimental scenario, not an official stage.

## Verification, files and constraints

- [Full distance priority-fairness matrix — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40373610150): **8 entire offline races**, baseline equivalence, alternate deterministic priority, exact checkpoints, app production build, micro regression tests.
- [Existing V3 legacy regression — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40373609944): 51 steps, 0 failed, no GitHub `##[error]` entries on actual job logs. Its *sporting* World Nations mountain-source check remains blocked: declared climb 1,785m, represented 720m, **1,065m missing**.
- [Overtaking capacity full-stage matrix — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40375107950): **4 entire offline cap-three races**, complete exact finish rows, physical/micro tests and serialized checkpoint recovery.
- Synthetic Guangxi source profile continues to miss **718m** of reported climbing, and road width/power/fatigue are not real-world calibrated. Finish-crossing interpolation still charges terminal energy for the complete ten-second tick.
- Code changes remain scoped to `scripts/v3/**`, isolated workflow `.github/workflows/v3-milestone-a2-*.yml`, and `docs/race-engine-v3/**`. The current default capacity **2** and historic `rider_id` order are unchanged; new tie policy is opt-in. No production source/routing/game clock/SQL altered.
- Two priority JSON archives plus two capacity JSON archives provide all full 2D rider classification rows, alternative rankings, gaps, metrics and checkpoint attestations. Consolidated offline ZIP includes a verified summary.

## Milestone and next corrective acceptance gate

**Milestone A1: COMPLETE technically. Milestone A2: OPEN with one effective but insufficient control identified. Gameplay/production: NOT APPROVED.**

Next, test the **actual cause of long-lived rear-row confinement**: earlier, rider-aware anticipation of a slower wheel (rather than waiting for several blocked ticks), genuine shared-space constraints, and multi-rider passing capacity with strictly conserved energy. Validate **all dimensions at once**: relative rider rank inversions, winner stability, final tail gaps, true separation/breakaways and several starting grids. Do not simply increase concurrency again or remove collisions to improve rank statistics. Authentic stage elevation/road-width data and terminal-tick energy accounting must be corrected before a go/no-go sporting decision.

**SPORTING NO-GO. No official results affected.**
