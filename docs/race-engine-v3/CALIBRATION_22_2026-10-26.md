# Race Engine V3 — Batch 22 offline power-duration A/B

**Date:** 2026-10-26  
**Code SHA:** `d81a56a64774cec1488f94a1dcaa9886e103d4ae`  
**Status:** TECHNICAL CI PASSED / **SPORTING NOT APPROVED** / **OFFLINE RESEARCH ONLY**  
**Official race writes:** 0. No production selector, database migration or game-clock update.

## What changed

- A guarded `experimentalPowerDurationEnergy: true` research option in the isolated coupled V3 solver.
- Finite W-prime accounting for achieved mechanical power above provisional rider critical watts; below-threshold recovery, separately accounted metabolic work, and a speed-request limit before spatial movement.
- Achieved physical work reflects before/after path drafting even if separate drafting telemetry is off.
- Research checkpoints persist the rider's short-duration energy state; multi-rider energy acceptance is preflighted and bottleneck telemetry is staged using the true pre-movement positions.
- Both legacy/default V3 physics and the official production racing selector are unchanged when the experiment flag is absent.
- An offline 106- and 168-rider full-stage A/B runner includes serialized checkpoint/resume equality tests for the plain and combined (anticipatory lanes + path drafting + bottleneck telemetry) modes.

## Full-stage A/B results

| Fixture | Riders | Mode | Baseline tail gap (s) | W-prime candidate tail gap (s) | Delta (s) | Baseline blocked rider-ticks | Candidate blocked rider-ticks | Checkpoint |
|---|---:|---|---:|---:|---:|---:|---:|---|
| Dordrecht | 106 | energy only | 2,850.694218 | 2,813.642783 | -37.051435 | 43,907 | 40,067 | identical |
| Guangxi | 168 | energy only | 1,625.522396 | 1,895.292841 | +269.770445 | 132,506 | 140,797 | identical |
| Dordrecht | 106 | energy + lane + path draft + telemetry | 2,980.513997 | 2,961.729571 | -18.784426 | 17,302 | 15,660 | identical |
| Guangxi | 168 | energy + lane + path draft + telemetry | 1,999.852304 | 2,083.132603 | +83.280299 | 84,206 | 79,680 | identical |

All four candidates completed, all 106/168 riders finished, and checkpoint JSON serialization/restart gave identical final results. Real in-race attack orders were represented only on the historical Dordrecht test fixture (15 attack orders); Guangxi did not map live commands.

### Accumulated research energy diagnostics

| Fixture and mode | Remaining W-prime (J, all riders) | Work above critical (J, all riders) | Modeled metabolic energy (J, all riders) |
|---|---:|---:|---:|
| Dordrecht energy only | 1,087,724.392399 | 1,811,534.713910 | 1,286,084,632.457652 |
| Guangxi energy only | 1,085,405.867700 | 4,301,278.161310 | 3,312,388,978.294088 |
| Dordrecht combined | 666,758.027464 | 2,617,979.116950 | 1,355,279,416.781304 |
| Guangxi combined | 528,821.647397 | 5,538,935.893440 | 3,509,227,030.101350 |

These are provisional research-model calculations, **not real measured rider physiology or energy consumption**. Model parameters are uncalibrated (20,000 J W-prime capacity, rider-power proxy critical watts, mechanical-to-metabolic factor 0.23 and modeled short-term recovery).

## Evidence

- [Batch 22 A/B, strict TypeScript, and production build — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40292214902)
- [Existing V3 legacy isolation / full-roster research regression — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40292214784)
- [Research implementation and CI gate](https://github.com/bracko87/ProPeloton-Manager/commit/d81a56a64774cec1488f94a1dcaa9886e103d4ae)

## Sporting blockers

1. **Large tail gaps remain.** Dordrecht tail gaps stay around 46–50 minutes and Guangxi around 27–35 minutes. The huge spread is not established as realistic.
2. **Guangxi regresses.** The energy-only mode increases the final tail gap by 269.77 seconds and the combined experiment increases it by 83.28 seconds. This is a sporting **NO-GO**.
3. **Incomplete mountain route.** Guangxi reports 1,718 m gain but its frozen route geometry only represents 1,000 m; 718 m remain missing. Climbing stress cannot be calibrated from this profile.
4. **Input commands and weather are approximate.** Dordrecht's 8 `fight_sprint_points` commands are mapped to `tempo` for testing, not modeled faithfully; race-specific road bearings, crosswinds, rain and heat are not reconstructed.
5. **Prototype physiology is uncalibrated.** The W-prime reservoir, aerobic capacity, repeated-attack recovery, sustained fatigue and body mass remain assumptions; a technical passing test is not sporting validation.

## Next acceptance criteria

- Resolve source route fidelity, original rider preparation and command mapping or mark explicit confidence limits.
- Diagnose Guangxi regressions per rider and segment, with energy-budget and wheel-blocking time series. Reject calibration attempts that merely fit final time gaps.
- Calibrate sustainable output, depletion, recovery and stage-long fatigue together against credible race evidence, then rerun both tests.
- Preserve the exact serialized checkpoint gate, 0 official writes, disabled-by-default experiment, baseline isolation, and green production build.
- **Do not enable V3 as the official engine or resume game clocks without explicit sporting approval.**
