# Race Engine V3 — Batch 24: separate W-prime from aerobic critical power

**Date:** 2026-10-26  
**Research implementation:** [bee9efd6a4b9b8a5dc38f41ce37bcd50fc766915](https://github.com/bracko87/ProPeloton-Manager/commit/bee9efd6a4b9b8a5dc38f41ce37bcd50fc766915)  
**Decision:** **SPORTING NO-GO**. Technical CI **PASSED**. OFFLINE ONLY. Official results written: **0**.

## Controlled hypothesis

Batch 22 tracked finite W-prime energy for supra-critical attacks but also passed remaining W-prime fraction into the fatigue envelope. At low W-prime, that envelope could reduce nominal sustainable aerobic critical watts by 20%. Batch 24 tests the causal effect of removing **only that second derate**.

The opt-in `experimentalSeparatedAerobicPower: true` requires `experimentalPowerDurationEnergy: true`. It retains all finite above-critical W-prime limits, actual movement energy debits, attack windows, road geometry, lane and drafting calculations, checkpoint resume, and the existing baseline/default branch. It does **not** restore W-prime capacity, implement chronic fatigue, or change official gameplay.

Comparison in each row is against **Batch 22's W-prime candidate with identical extra flags**, not against production or the original V3 control.

## Full-race A/B, last-rider finishing-gap spread

| Frozen fixture | W-prime physics baseline gap (s) | Separated aerobic candidate gap (s) | Change in gap (s) | Median rider gap change (s) | Mean rider gap change (s) | Change in blocked rider-ticks |
|---|---:|---:|---:|---:|---:|---:|
| Dordrecht, 106 riders — energy-only | 2,813.642783 | 2,849.315720 | **+35.672937** | +51.505 | +72.361 | **+7,861** |
| Guangxi, 168 riders — energy-only | 1,895.292841 | 1,897.896256 | **+2.603415** | **−7.416** | **−5.816** | −239 |
| Dordrecht — energy + anticipatory lanes + path draft + bottlenecks | 2,961.729571 | 2,976.450303 | **+14.720732** | +12.789 | +9.799 | +43 |
| Guangxi — combined experiment | 2,083.132603 | 2,121.276822 | **+38.144219** | +21.618 | +18.126 | +9 |

Positive time-gap deltas mean worse relative separation. These are **last-rider gaps**, not race winning times; they do not directly establish realistic rider ability ordering. All four A/Bs finished with full 106/168-rider rosters and yielded equivalent serialized-versus-uninterrupted checkpoints in the new candidate. All official writes remained zero.

## Sector and individual findings

1. **Guangxi energy-only displays a mixed effect.** The majority of rider gap deltas improved (100 riders improving, 67 worsening, one unchanged); the median improved 7.4 seconds despite the last-rider gap worsening 2.6 seconds. The synthetic 160.8–162.6 km steep segment gained approximately **+0.099685 m/s** in mean sampled speed, whereas 158–160.8 km lost **0.033492 m/s**.
2. **Dordrecht energy-only significantly regresses.** 87 riders have worse relative gaps versus 18 better and one unchanged. Its final 112–118.5 km segment lost **0.105366 m/s**, and the full-race model accumulated **7,861 additional blocked rider-ticks**. This is a clear downstream positioning interaction; the power-limit fix alone cannot be considered a sporting improvement.
3. **Guangxi combined mode also worsens.** Mean rider gap +18.1 seconds, median +21.6 seconds. Its steep 160.8–162.6 km sector gained **+0.085453 m/s**, but the 158–160.8 km approach was slower by **0.039836 m/s**. Overall blocked ticks changed by only +9; race separation depends on the distribution/timing of rider interactions, not just the aggregate blocking count.
4. **W-prime cost remains finite.** The 12-rider invariant test includes two distinct ordered attacks, recorded mechanical work above provisional critical watts, verified no free supra-critical work from empty W-prime, and exact serialized restart. These are technical protections, not sporting calibration.

## Exact verification

- [Batch 24 matrix A/B, TS strict, 12-rider attack/checkpoint tests and app build — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40296536266)
- [Batch 22 full-roster W-prime A/B regression — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40296536281)
- [Batch 23 energy/sector diagnostic regression — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40296536267)
- [V3 legacy isolation and full race regression — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40296536272)

Complete per-rider and per-route-section JSON artifacts are retained in GitHub Actions for 30 days as `v3-batch24-energy-sectors` and `v3-batch24-combined-sectors`. Both were downloaded and independently inspected. The analysis uses 120-second midpoint-sector sampling, not continuous per-metre integration.

## Caveats and next experiment

- The Guangxi proxy profile covers only **1,000 m of the reported 1,718 m climb**; source elevation is still missing for 718 m. No valid final mountain-physics sporting calibration is possible.
- 8 Dordrecht sprint-points orders are mapped to `tempo` in the test; weather exposure, rider power and W-prime capacity are approximated.
- Short-term reserve, sustainable watts and long-term fatigue are not yet calibrated against actual evidence. Removing a suspected double derate does not by itself fix wheel bottlenecks.
- **Next priority, Batch 25:** isolate geometric lane-change and wheel-blocking cascades using deterministic per-tick events and fixed rider/power targets, then replay the full roster with unchanged physiology. Assess position changes, group gaps, rank order, and collision safety. Keep the separated-aerobic option OFF, not sporting-approved, pending causally credible evidence.
- Continue to require default-mode byte stability, no official writes, explicit opt-in, exact checkpoint resumes, full V3 CI and app build. **Do not enable V3 for official races, rewrite results, or change game clocks.**
