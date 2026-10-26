# Race Engine V3 — Batch 25: wheel-obstruction propagation and controlled lane geometry

**Date:** 2026-10-26  
**Instrumented code:** [8a6801ef8c281261b42ecb1fe53c47d0b92492a6](https://github.com/bracko87/ProPeloton-Manager/commit/8a6801ef8c281261b42ecb1fe53c47d0b92492a6)  
**Decision:** **SPORTING NO-GO**; technical workflows **PASSED**; OFFLINE ONLY. Official race-result writes **0**. No physical racing solver, production race selector, game-clock, historical race result, or Supabase changes.

## Method

Two distinct, complementary tests were added as research-only scripts:

1. **Actual coupled V3 full races:** re-run the existing frozen Dordrecht (106) and Guangxi (168) fixtures in ordinary W-prime-off versus W-prime-on A/B, both energy-only and combined anticipatory-lane + path-draft scenarios. Every tick, inspect a rider's recorded blocked status and the nearest bicycle initially ahead in the same lane. An *obstruction chain* occurs when the rider is blocked and the upstream same-lane rider is blocked during that same tick; longer depths describe contiguous upstream blocked riders. No target velocities or racing physics are modified.
2. **Controlled 96-tick spatial shadow (960 seconds):** reuse each frozen roster and identical starting grid; assign the same fixed desired speed to each rider at every tick in both arms. Arm B may execute the already-existing safe, anticipatory **lateral-only** lane preparation after a tick, without granting longitudinal distance in that tick; arm A retains ordinary lane placement. Energy demand and speed targets are exogenous and identical in both arms; all speed differences realized downstream are geometric. Confirm deterministic reruns, full-roster collision checks and zero official writes.

**Definition warning:** The observed chain is a *same-lane adjacency and simultaneous-blocking diagnostic*, **not** a mechanically established direct causal chain. A blocked upstream rider may not be the unique cause of a downstream block; lane changes, positions, weather and power can co-vary.

## Real frozen-roster full-stage A/B

All time-gap deltas compare **Batch 22 W-prime ON** against the matching **Batch 22 W-prime OFF** mode, not the official production engine.

| Race | Mode | Tail-gap change | Change in all blocked rider-ticks | Change in chain-involved blocked ticks | Chain share: OFF → ON | Maximum upstream blocked depth: OFF → ON |
|---|---|---:|---:|---:|---:|---:|
| Dordrecht, 106 | energy-only | -37.05 s | -3,840 | **-4,680** | 73.69% → 69.07% | 19 → 14 |
| Guangxi, 168 | energy-only | **+269.77 s** | **+8,291** | **+10,169** | 80.37% → 82.86% | 44 → 44 |
| Dordrecht, 106 | combined | -18.78 s | -1,642 | **+22** | 19.48% → 21.67% | 14 → 15 |
| Guangxi, 168 | combined | **+83.28 s** | -4,526 | **+922** | 51.23% → 55.30% | 24 → 24 |

A positive gap delta indicates a larger last-rider gap. One rider contributes multiple rider-ticks during a race; these are **not** unique rider counts.

In Guangxi energy-only mode, chain-involved blocked ticks rise in every distance quarter: **+2,532**, **+2,902**, **+2,685**, **+2,050**. Individual rider changes in chain involvement and gap deterioration are correlated **r ≈ +0.722** (descriptive, not causal); mean rider gap worsened +30.12 s, median +22.83 s.

In Guangxi combined mode, chain-involved ticks change by **-3,764, +8,164, -562, -2,916** across quarters 1–4. This leaves a net **+922** chain-involved blocked ticks, despite **4,526 fewer blocked ticks overall**. Mean gap worsened +63.52 s and median +65.35 s. A single whole-race blocked-tick aggregate hides this temporal structure.

## Fixed-speed, fixed-roster geometry-only shadow

The following simulated distances are **summed across all riders**, **not** the length of an individual stage. This is a 96-tick controlled spatial experiment, not a real-race replay.

| Roster | Standard movement blocked ticks | Anticipatory preparation blocked ticks | Reduction | Upstream-chain involved ticks: standard → anticipated | Cumulative distance change across all riders |
|---|---:|---:|---:|---:|---:|
| Dordrecht, 106 | 6,343 | 2,181 | **65.6%** | 5,207 → 1,360 | +88,124.50 metres |
| Guangxi, 168 | 13,108 | 5,765 | **56.0%** | 11,844 → 3,748 | +113,999.85 metres |

The anticipatory preparation made 617 synthetic lateral moves in Dordrecht and 1,275 in Guangxi, each validated to provide **no instantaneous additional forward distance**. The output was deterministic on replay; all simulated trajectories passed spatial collision checks. This demonstrates the **potential** of lane freedom under fixed demands, not that these large aggregate metre changes are credible sporting effects or that the same improvement will occur when power, drafting and real orders feed back.

## Engineering verification

- [Batch 25 diagnostics, 106/168-rider full-stage A/B, synthetic same-speed lane shadow, app build — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40298328506)
- [V3 legacy isolation, deterministic full-race regressions and strict research validation — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40298328685)
- Source code was unchanged under `src/race-engine-v3/**`. The commit contains only new offline scripts and one GitHub workflow.
- Full rider traces saved as GitHub Actions artifacts `v3-batch25-energy-cascades` and `v3-batch25-combined-cascades` for 30 days.

## Remaining blockers and Batch 26 recommendation

- These are synthetic/frozen research races: Guangxi's proxy geometry omits 718 m of reported ascent; original weather bearings and power calibration remain incomplete. Eight Dordrecht sprint-point commands are still approximated as tempo.
- **Do not optimize blindly on chain count.** Lower count can coexist with wider finishing gaps due to who gets blocked, how long and where. Record the *first bottleneck after rider divergence* and upstream/downstream positions, not just total counts.
- **Batch 26:** perform a targeted, **fixed-power and fixed-start paired branch** at the first obstruction divergence, preserving all rider physiological state while allowing only a bounded lane-choice candidate. Compare positional flow, gaps, ability ordering and actual per-rider energy costs; include long-tail riders and 160.8–162.6 km Guangxi climb. Allow no gain in speed from the lateral shift itself, and retain swept-corridor and per-lane minimum-gap checks.
- Do not make any V3 option the official race engine, alter race clocks or mutate historical results without separate sporting review and release authorization.

**Sporting status remains NOT APPROVED.** A successful software CI run is not a sporting-realism approval.
