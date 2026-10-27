# Race Engine V3 — Milestone A2: 5-second seconds-normalized physical timing

**Review date: 27 October 2026. Technical gate: PASS. Sporting acceptance: FAILED — NO-GO.**

## Question, implementation, and isolation

The previous [5s versus 10s experiment](MILESTONE_A_08_STEP_SIZE_2026-10-26.md) altered overtaking reaction, steering and acceleration as well as numerical step size. To investigate, the opt-in `experimentalTimingPolicy: 'seconds_normalized'` in the **offline-only** coupled 2D solver holds the reference *nominal* physical envelopes of the 10s model:

- Reaction 20 seconds: two 10s ticks versus four 5s ticks.
- Steering 30 seconds: three 10s ticks versus six 5s ticks.
- Per-tick maximum speed change: 0.9 m/s for 10s, 0.45 m/s for 5s, each nominally 0.09 m/s².
- The original `legacy` timing policy remains the default and is byte-equivalent at 10s, including compatible serialized checkpoints.
- Overtaking reservation capacity remains globally three; the existing swept 2D collision verifier, lateral clearance, finite W-prime, steering energy, rider powers, tactics, and synthetic road geometry are otherwise unchanged.

Code: [initial experimental implementation](https://github.com/bracko87/ProPeloton-Manager/commit/7568cf2f55ae03b2ce414b85d243cb542fa7fe82); [10s compatibility correction](https://github.com/bracko87/ProPeloton-Manager/commit/fd941af780de0b8ed17eb5df438c1e7186312c70); [audit reporter correction](https://github.com/bracko87/ProPeloton-Manager/commit/7008e730b48781be1f23d63a0f8572d851555c9a). Earlier CI attempts failed at the test and reporting layers and were corrected **before** accepting any full-stage results.

## Completed full-stage test matrix

Both Dordrecht (106 riders) and Guangxi (168 riders) each ran nine complete stages: (1) 10s legacy control, (2) 5s unnormalized legacy, (3) 5s seconds-normalized candidate; each across original, exactly two starting lanes swapped, and all starting lanes rotated. **18 completed full-stage runs.**

### Original-grid metrics

| Metric | Dordrecht 10s | Dordrecht 5s legacy | Dordrecht 5s normalized | Guangxi 10s | Guangxi 5s legacy | Guangxi 5s normalized |
|---|---:|---:|---:|---:|---:|---:|
| Winner | r003 | r032 | r003 | r003 | r003 | **r015** |
| Last-rider gap, seconds | 1,193.300376 | 1,178.808226 | 1,156.802017 | 1,231.182305 | 827.106900 | 934.651495 |
| Completed steering reservations | 573 | 1,386 | 271 | 905 | 1,725 | 747 |
| Aborted steering reservations | 264 | 47 | 17 | 279 | 129 | 58 |
| Blocked rider-time, sampled seconds | 927,680 | 894,920 | 949,770 | 2,082,870 | 2,228,070 | 2,311,410 |
| Mechanical energy across riders, J | 278,831,834.722 | 281,995,615.481 | 279,896,875.419 | 714,467,882.608 | 720,633,916.716 | 712,167,179.904 |
| First geometric 30m split, s | 160 | 110 | 170 | 170 | 110 | 165 |

Blocked rider-time is a sum of rider-ticks multiplied by tick duration, *not* unique rider waiting time. Steering completion is not equivalent to a tactical overtake. Sum-of-rider mechanical joules does not verify race realism.

### Finishing-order sensitivity to the same starting-grid perturbations

**Lower percentages are better** (share of rider pairs with inverted relative finishing order versus the original grid for the same timing policy).

| Metric | Dordrecht 10s | Dordrecht 5s legacy | Dordrecht 5s normalized | Guangxi 10s | Guangxi 5s legacy | Guangxi 5s normalized |
|---|---:|---:|---:|---:|---:|---:|
| Two-rider swap inverted pair share | **7.619048%** | 11.141060% | **9.721473%** | **18.555746%** | 24.051896% | **24.372683%** |
| Full-lane rotation inverted pair share | 8.319856% | 7.295597% | **6.504942%** | **20.280867%** | 25.363559% | **27.323924%** |
| Two-rider swap changes winner | Yes | Yes | **No** | No | No | **Yes** |
| Full-lane rotation changes winner | Yes | Yes | Yes | No | Yes | **Yes** |
| Swap inversion delta vs 10s (percentage points) | — | +3.522012 | **+2.102425** | — | +5.496150 | **+5.816937** |
| Rotation inversion delta vs 10s (percentage points) | — | −1.024259 | **−1.814914** | — | +5.082692 | **+7.043057** |

**Dordrecht:** Normalization improves the 5s model's two-rider swap by 1.419587 percentage points and rotated-grid comparison by 0.790655 points, but the swapped-grid sensitivity is **still 2.102425 points worse than 10s**. The winner stays r003 under the two-rider swap, though under full-grid rotation it changes to r004.

**Guangxi:** Normalization **worsens both** perturbation metrics compared with 10s, and both also worsen compared with 5s legacy: +0.320787 and +1.960365 percentage points respectively. Original-grid winner changes from r003 to r015; swapped and rotated normalized grids both have winner r003. The normalized 5s original race's last-rider gap shrinks by 296.530810 seconds relative to 10s, but the unstable rider classification is unacceptable.

## Engineering validation and limitations

**CI proof:** [Full-stage normalized-timing GitHub Actions: SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40404842895), both independent stage jobs green, after the earlier failures were corrected. Micro collision/finish checks, 10s baseline invariance, and 5s candidate full-stage serialised checkpoint recovery pass. Dordrecht application production build passed. [Legacy-isolation workflow: SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40404843021). The GitHub Action artifacts `v3-a2-normalized-dt-dordrecht-2000-10-15` and `v3-a2-normalized-dt-guangxi-2000-10-19` contain full rider classifications and comparisons, subject to 30-day retention.

**This is still not a controlled convergence proof.** Normalization addresses nominal reaction/steering durations and speed-change limits, but collision ordering and position clipping are sequential; the blocked-streak counter, W-prime integration, 10s vs 5s substep effects, and time of reservation admission may affect results. The road width is synthetic; available stage elevation is incomplete (718 m missing Guangxi and 1,065 m missing World Nations), and no source-grounded breakaway/chase benchmarks or verified final-tick energy are included.

**Production isolation:** No race-engine selection changes, official result writes, Supabase mutations, historical race overrides, worker releases or game-clock changes. All experiments remain opt-in and default-off.

## Decision and next bounded A2 gate

**Technical: PASS. Sporting realism: FAIL. Candidate: REJECTED for gameplay.** Equal nominal physical reaction/steering durations do not solve grid sensitivity across both fixtures. Do not promote either 5-second policy.

**Next:** Before proposing more passing heuristics, investigate **sequential collision-resolution priority** at a controlled fixed physical time step; isolate the effects of rider processing order, and establish whether the current within-tick solve disproportionately favors the front-ranked rider. Require baseline-equivalent collision and W-prime safeguards, reproducible recovery and multiple start grids. Independently prioritize route ascent/road-width fidelity, finish-tick energy and authentic breakaway/pack benchmarks; those are required sporting gates regardless of numerical experiments.

**A1: technically passed. A2: OPEN / NO-GO. B: NOT STARTED. C: NOT STARTED.**
