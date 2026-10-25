# Race Engine V3 — Batch 20: Anticipatory lane-change research

**25 October 2026 | Isolated V3 research only | Engineering integrity: PASS | Sporting realism: FAIL | Production activation: NONE**

## Engineering changes

Previous full-length bottleneck telemetry found that roughly 52% of active rider-ticks were wheel-limited in both frozen-size race experiments. The existing planner attempts to switch lanes only if it can benefit immediately within that tick. This can trap slower riders in a lane for hundreds of ticks.

Batch 20 introduces `src/race-engine-v3/anticipatoryLaneResearchV3.ts`, a pure **experimental** lane preparation candidate. It uses the existing spatial model's *actual, unmodified achieved trajectories* and selects an adjacent lane only for a blocked rider who did not already change lanes and whose destination has more geometric headway. It checks the entire linear longitudinal sweep for wheel clearance, including the formerly occupied lanes of already reserved shifts, rejects conflicting end positions, and never gives the rider free extra forward meters, watts, energy or a scripted finishing gap.

**Important limitation:** this is a discrete prospective lane assignment at the end of a tick; continuous lateral displacement, duration, slipstream geometry and energy during the actual sideways motion are **not yet physically simulated or validated**. Collision screening under this approximation is not proof of full 2D collision safety. The test is intentionally isolated and sporting approval remains hard-coded `NOT_APPROVED`.

The integrated offline research simulator `coupledRoadRaceResearchV3.ts` gains **`experimentalAnticipatoryLaneMoves: true`**. This switch is absent/off by default and requires the existing explicit offline/no-sporting-approval gate. The only physical modification when enabled is prospective lane choice *for the following tick*. Every rider's chosen lane and optional anticipatory move counter is persisted and resumable with the existing authoritatively derived physical replay and group timeline.

A small diagnostic correction in `wheelBottleneckTelemetryV3.ts` now uses the executed spatial planner's exact `wheelLimited` bit rather than a rounded duplicate threshold. This prevents one-tick discrepancies between observed and instrumented blocking counts; it does not change a rider's motion.

## Full-length A/B tests — explicitly synthetic rider source substitutes

These tests use the **same** frozen roster sizes, coarse stage routes, prepared tactical orders, speed/power mapping and deterministic starting geometry as the previous Batch 19 integrated benchmark. They do **not** use the private original-rider supplement or independently measured watts. Guangxi's coarse route still omits 718 metres of claimed ascent.

| Metric | Dordrecht reference | Dordrecht opt-in | Guangxi reference | Guangxi opt-in |
|---|---:|---:|---:|---:|
| Race distance | 118.5 km | 118.5 km | 165.8 km | 165.8 km |
| Riders completing | 106 | 106 | 168 | 168 |
| Wheel-limited rider-ticks | 66,928 | **19,781** | 145,773 | **78,076** |
| Blocked active rider share | 51.89% | **15.90%** | 51.97% | **28.37%** |
| First-quarter blocked share | 69.07% | 34.98% | 78.98% | 49.99% |
| Longest consecutive blocking streak | 1,250 ticks | 392 ticks | 706 ticks | 446 ticks |
| Actual recorded passes | 324 | 528 | 710 | 881 |
| Additional experimental lane preparations | — | 1,788 | — | 3,895 |
| Last rider gap to winner | +2,694.469 s | **+2,860.354 s** | +2,001.083 s | **+2,055.269 s** |
| Complete stage serialized restart batches | 36 | 36 | 45 | 45 |
| Sporting acceptance | FAIL | **FAIL** | FAIL | **FAIL** |

The geometry experiment reduces blocking by **70.44%** in Dordrecht and **46.44%** in Guangxi, and allows more actual overtakes. Nonetheless, the last-rider gap **worsens by 165.885 s** (Dordrecht) and **54.186 s** (Guangxi). This is a **rejected sporting candidate**, not an acceptable new official physics algorithm. Both the reference and experiment already exhibit unrealistic multi-minute spread. The apparent reduction in congestion must not be confused with calibration of drafting, recovery, work rotation or road realism.

A more restrictive candidate requiring a following wheel in the target lane was also tested locally: it reduced congestion less and still worsened stage gaps. That additional variant was **not committed**.

## Reproducibility and tests

- **36/36 available public V3 research/test scripts passed**, with zero failures, using Node.js 22.16 and strict TypeScript 5.8 validation. The protected operator-only private-rider source runner was excluded.
- `verify-anticipatory-lanes-v3.mjs`: deterministic lane choice, bounded one-lane movement, no added longitudinal distance, rider array permutation invariance, nonmutation and malformed-state rejection.
- `verify-anticipatory-coupling-v3.mjs`: opt-in 28-rider synthetic full-stage simulation, unmodified default output, deterministic replay/group history and serialized restart equivalence.
- `verify-coupled-race-v3.mjs` supports `V3_ANTICIPATORY=1` alongside `V3_BOTTLENECKS=1 V3_FULL_ROSTERS=1 V3_FULL_RESUME=1`, enabling **complete 106-/168-rider A/B measurements with exact checkpoint restart**.
- Both complete opt-in simulations and their telemetry reproduced **byte-identically** across 36 and 45 intermittent save/restore batches; the baseline remains unchanged.
- The dedicated V3 Actions workflow includes the structural, integration and both complete race A/B checks, and adds strict typing of the new module.
- Local V3 tests passed. **GitHub Actions remote success, full application build, Netlify deployment, and production UI remain unverified**; the isolated package is not a complete application build.

## What this actually means for the whole engine

The mathematical problem has become sharper: **avoiding unnecessarily prolonged lane trapping is necessary but not sufficient for believable road racing.** When riders change places more freely, their aerodynamic protection and the group's pace/power/energy balance change; today's coupled engine does not yet model those effects reliably. Adding more overtakes in isolation can actually make the tail worse. The future fix needs **time-continuous lateral trajectory, group-aware aerodynamics and shared workload/recovery**, validated against source-complete flat and mountain races.

**Release boundary:** changes restricted to isolated V3 research modules and scripts, its existing dedicated CI workflow, and this report. Nothing changes the older Baseline, Mountain V2, Breakaway V1 or original V3 motion engines, production selector, published race results or game clock. Never activate this candidate for official racing; keep the main/secondary clocks paused at Season 1 20 October 06:38, with stored 12× until a separately approved 2× restart.

**Verdict: Batch 20 opt-in geometry experiment implemented, regression tested and documented; sporting approval still CLOSED.**
