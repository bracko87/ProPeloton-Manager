# Race Engine V3 — Milestone A2: as-implemented 5s versus 10s simulation sensitivity

**26 October 2026 — TECHNICAL PASS (both stages, 12 scenarios). SPORTING NO-GO.**

## Purpose and scope

Previous A2 passing-capacity and lane-choice interventions failed the initial-grid sporting-stability gate. This test measures whether changing *only the input time-step value* for the existing coupled 2D research solver changes technical validity, physical race outputs and start-grid sensitivity.

The offline test script and CI were added in [`4224d9c0`](https://github.com/bracko87/ProPeloton-Manager/commit/4224d9c02e419222c01c7e1e1e79f93de726c767). Two full-stage fixtures, Dordrecht with 106 riders and Guangxi with 168, each run at `dt=10` and `dt=5` with identical original, two-rider-lane-swap and full-lane-rotation starting grids: **12 completed simulations**. Global overtaking capacity 3, existing `left_first` passing behavior, synthetic 5m road, rider power and tactical assignments are otherwise unchanged. Every run captures and exactly recovers a mid-race checkpoint.

### Critical interpretation warning

**This is NOT an isolated numerical-convergence experiment.** In the existing code the two reaction ticks take **20s at dt10** versus **10s at dt5**; three steering ticks take **30s** versus **15s**; the permitted speed increase/decrease remains **0.9 m/s per tick** (therefore a different physical acceleration). Changing dt therefore changes underlying race behavior and passing frequency. The comparison cannot prove whether sequential collision processing or integration error is responsible for any measured sporting instability. Do not promote dt5 or claim more accurate physics.

## Full-stage original-grid results

| Metric | Dordrecht 10s | Dordrecht 5s | Guangxi 10s | Guangxi 5s |
|---|---:|---:|---:|---:|
| Classified riders | 106 | 106 | 168 | 168 |
| Winner | r003 | **r032** | r003 | r003 |
| Winning time (s) | 11,940.508200 | 11,931.514856 | 17,566.270712 | 17,638.736633 |
| Last-rider finishing gap (s) | 1,193.300376 | 1,178.808226 | 1,231.182305 | **827.106900** |
| First geometric 30-metre split (s) | 160 | 110 | 170 | 110 |
| Completed steering reservations | 573 | 1,386 | 905 | 1,725 |
| Aborted reservations | 264 | 47 | 279 | 129 |
| Blocked rider-ticks (not normalized by dt) | 92,768 | 178,984 | 208,287 | 445,614 |
| Mechanical energy summed over riders (J) | 278,831,834.722274 | 281,995,615.481005 | 714,467,882.608317 | 720,633,916.716355 |
| Minimum finisher W-prime (J) | 5.000494 | 2.500167 | 4.999957 | 2.500214 |
| Full simulation ticks | 1,314 | 2,623 | 1,880 | 3,694 |
| Full-stage deterministic checkpoint restart | PASS | PASS | PASS | PASS |

Blocked rider-ticks must not be compared as if they were equal physical durations; the 5s model has approximately twice as many movement steps. Finished-rider W-prime is also provisional because finish-line crossing energy is still charged for a complete time step, not the fractional crossing instant.

## Three-grid sporting stability comparison

The share below counts rider pairs whose finishing order reverses when **only the specified starting lanes are changed**, using the original grid of the same dt as its control.

| Grid perturbation | Dordrecht 10s | Dordrecht 5s | Guangxi 10s | Guangxi 5s |
|---|---:|---:|---:|---:|
| Swap two starting lanes — inverted pair share | **7.619048%** | **11.141060%** | **18.555746%** | **24.051896%** |
| Rotate every starting lane — inverted pair share | 8.319856% | 7.295597% | **20.280867%** | **25.363559%** |
| Swap: increase/decrease in inversion share at 5s | — | **+3.522012 pp (worse)** | — | **+5.496150 pp (worse)** |
| Rotation: increase/decrease at 5s | — | **−1.024259 pp (better)** | — | **+5.082692 pp (worse)** |
| Swap changes winner | Yes | Yes | No | No |
| Rotation changes winner | Yes | Yes | No | **Yes** |

Dordrecht's **original-grid** winner changes from r003 (10s) to r032 (5s); its 5s swapped-grid winner is r004 and rotated-grid winner r006. Guangxi retains original winner r003, but the 5s full-lane-rotated winner changes to r078. Step-size choice changes original-grid finishing order as well: 8.158131% inverted pairs for Dordrecht and 21.228971% for Guangxi when 10s and 5s original classifications are compared.

The original-grid tail gap shrinks by **14.492150s Dordrecht** and **404.075405s Guangxi** under dt5, but improved tail compression does not imply historically believable bunch/split formation, and the grid-perturbation metrics mostly regress. More steering reservations can reflect faster physical steering cycles, not better racing.

## Verification and evidence

- [GitHub Actions — A2 5s vs 10s acceptance, SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40400691465). Both independent fixtures pass the safety/finish 2D micro tests, complete all six grid/dt scenarios, classify every rider, and reproduce entire final solver state through serialized 40%-distance midrace checkpoint recovery; completed races are immutable.
- [Legacy-isolation SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40400691282). This proves isolation, not sporting quality.
- Archived GitHub Action artifacts: `v3-a2-step-size-dordrecht-2000-10-15` and `v3-a2-step-size-guangxi-2000-10-19`, retaining full results, control/sensitivity matrices, energy metrics and limitations (30 days).
- The original 10s full-stage baselines match their previously verified winning rider and final gap exactly. Existing game engine selector, historic results, SQL/production player data, game clocks, tactics UI and workers remain untouched. **Official writes: 0.**

## Decision and next bounded engineering gate

**Do not switch the experimental model to dt5.** This is a successfully completed diagnostic that finds significant sensitivity and non-equivalent physical controls, not a corrected sporting engine.

Before attributing instability to numerical integration or sequential collision resolution, introduce an **offline-only, seconds-normalized dt5 control** preserving dt10's physically defined 20s reaction, 30s steering and 0.09 m/s² acceleration envelope (0.9 m/s per 10s), while retaining finite W-prime and the original collision checker. Compare it with dt10 across three grids, with full checkpoint recovery and stage outcomes. Only after this normalization study should different simultaneous-versus-sequential motion solvers be considered.

Independent sporting blockers persist: missing **718m Guangxi** and **1,065m World Nations** route ascent, unverified actual road widths, historical flat/hilly/mountain performance and group dynamics, calibrated weather/attack/fatigue responses, and sub-tick finish energy.

**A1 technical PASS. A2 sporting FAIL / OPEN. Milestones B and C NOT STARTED. Official engine promotion NO-GO.**
