# V3 Race Engine — Batch 23: W-prime depletion versus peloton obstruction

**Date:** 2026-10-26  
**Instrumentation commit:** `0cc0ad563848b2d1df036a6a6b06a52b9f3dfdc7`  
**Decision: SPORTING NO-GO.** This is research-only diagnostic instrumentation. No physics, production selector, official race tables, or clocks were changed in Batch 23.

## Verified execution

- [Batch 23 two-mode full-race diagnosis and production application build — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40294152777)
- [V3 legacy isolation and regression workflow — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40294152776)
- GitHub Actions output artifacts: `batch23-energy-rider-traces` and `batch23-combined-rider-traces`. They contain the complete **per-rider rows**, four distance quarters, and all route-segment summaries for Dordrecht and Guangxi. Artifacts expire after 30 days.
- All four full-race trace outputs reproduced Batch 22's exact tail gaps within 0.0001 s. No official writes; both configurations kept sporting approval as `NOT_APPROVED`.

## Summary: changes from control without the energy model

| Fixture | Mode | Tail finishing-gap change | Mean rider finishing-gap change | Position/obstruction finding |
|---|---|---:|---:|---|
| Dordrecht, 106 riders | energy only | -37.05 s | -40.45 s | Rider gap delta versus additional blocked ticks correlation +0.58 |
| Guangxi, 168 riders | energy only | **+269.77 s** | +30.12 s | Rider gap delta versus additional blocked ticks correlation **+0.70** |
| Dordrecht, 106 riders | combined lanes + drafting + telemetry + energy | -18.78 s | +0.98 s | Correlation -0.35 |
| Guangxi, 168 riders | combined | **+83.28 s** | +63.52 s | Correlation -0.17 |

These correlations are **descriptive**, not causal; group speed, drafting, wheel blocking, and energy change together. Tail gap and mean rider gap are different outcome measures.

## Guangxi energy-only — distance-quarter view

| Distance (km) | Mean rider speed change vs baseline (m/s) | Additional blocked rider-ticks | Share of sampled rider time below 10% W-prime |
|---|---:|---:|---:|
| Q1: 0–41.45 | -0.0180 | +1,643 | 0% |
| Q2: 41.45–82.90 | -0.0141 | +2,236 | 1.41% |
| Q3: 82.90–124.35 | -0.0353 | +3,399 | 6.60% |
| Q4: 124.35–165.80 | **-0.0546** | +1,013 | **19.28%** |

Total additional blocked rider-ticks in Guangxi energy-only: **8,291** (140,797 vs 132,506). The W-prime candidate's overall tail gap increased **269.77 s**.

The riders with the five worst changes in *relative finishing gap* — `r058`, `r117`, `r079`, `r114`, `r052` — showed **zero time sampled below 10% W-prime**, but respectively **+994, +1,243, +841, +882, and +401 additional blocked ticks**. This strongly argues against treating depleted W-prime as a sufficient explanation for the largest energy-only gap regressions. The 120-second sampling can miss brief events.

## Guangxi combined experiment

| Distance (km) | Mean rider speed change vs combined baseline (m/s) | Change in blocked rider-ticks | Share below 10% W-prime |
|---|---:|---:|---:|
| Q1: 0–41.45 | +0.0246 | -3,394 | 0% |
| Q2: 41.45–82.90 | -0.0296 | +5,693 | 1.14% |
| Q3: 82.90–124.35 | +0.0058 | -1,800 | 11.44% |
| Q4: 124.35–165.80 | **-0.0677** | -5,025 | **31.51%** |

The combined experiment **reduces overall blocked ticks by 4,526**, yet Guangxi's tail gap still worsens **83.28 seconds**. Blocking alone therefore cannot explain the combined-mode result.

The steep **160.8–162.6 km** segment (frozen-profile grade approximately **7.78%**) shows the biggest mean-speed penalty: **-0.1141 m/s** energy-only and **-0.1997 m/s** combined. This is a material signal for more targeted power-limit and group-geometry tests, but the Guangxi fixture is still missing **718 m** of reported elevation gain.

## W-prime/aerobic power coupling hypothesis

The Batch 22 integrated solver stores `rider.energy = remainingWPrimeJoules / wPrimeJoules`, then passes that same value to `fatiguePowerEnvelopeV3` which can reduce peak deliverable watts to **80%** of the proxy critical power when the reservoir is empty. This mixes a short-duration anaerobic reservoir with a derating of nominal sustained aerobic watts. It is a **specific source-code mechanism worth isolating**, not proof that it explains all race losses.

Across all rider time, the sampled average modeled aerobic-envelope deficit is approximately:
- Guangxi: **0.70 W** energy-only; **1.16 W** combined.
- Dordrecht: **0.48 W** energy-only; **1.04 W** combined.

This modest race-wide average coexists with larger late steep-sector effects; investigate the localized tail rather than interpreting the average as a universal penalty.

## Technical and evidentiary limitations

- Rider attributes are de-identified fixtures, not verified complete source physiology or power measurements.
- W-prime capacity, recovery and critical watts are **provisional**. No real-road watt sensor calibration.
- Guangxi route reconstructs only **1,000 of the reported 1,718 m climbing**.
- Eight Dordrecht `fight_sprint_points` orders are approximated as `tempo`; wind bearing, rainfall and heat are not fully represented.
- A **120-second position midpoint** assigns observations to a quarter/segment for reporting. This is not exact per-metre work allocation.
- Correlation does not identify cause, and a shared peloton creates non-independent rider observations.

## Next controlled research experiment

1. **V3 Batch 24 candidate:** with every other physical input held constant, A/B an **explicitly gated, offline-only separation of W-prime from sustained aerobic power envelope**, so attack burst availability still depends on W-prime but nominal critical watts are not automatically derated by the same reservoir.
2. Track critical-power headroom, per-rider speed caps, wheel-blocking transitions, high-gradient finishing segments and repeated attacks. Include both the standard and combined lane-drafting scenarios.
3. Reject improvement claims based solely on last-rider gaps; assess full finish distributions, route segments, checkpoint determinism, collision avoidance and efficiency of the energy model.
4. Require green V3 isolation, zero official writes, exact restart invariants, full application build and explicit sporting approval before considering activation.

**Official race engine, game clocks and existing results remain unchanged.**
