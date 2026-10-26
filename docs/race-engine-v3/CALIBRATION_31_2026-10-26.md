# Race Engine V3 — Batch 31: finite passing with real W-prime work accounting

**Date:** 2026-10-26  
**Experiment implementation:** [9b72580e5bf0935d4316070980a5331dcae4ee4a](https://github.com/bracko87/ProPeloton-Manager/commit/9b72580e5bf0935d4316070980a5331dcae4ee4a)  
**Strict TypeScript fix:** [53c24bec2e5a01ea2e282e64d224aa8bbecfe322](https://github.com/bracko87/ProPeloton-Manager/commit/53c24bec2e5a01ea2e282e64d224aa8bbecfe322)  
**Decision:** **TECHNICAL CI PASS / SPORTING NO-GO / OFFLINE RESEARCH ONLY**. Official writes: **zero**. Default feature disabled. No production engine selector, Supabase migration, historical results, schedules or game-clock operations.

## Purpose and mechanism

Batch 30 used 16-minute fixed-speed shadows to test passing reservations. Batch 31 integrates the finite-duration option directly into the **isolated coupled V3 simulator** so actual motion, road-power demand, rider critical watts, high-intensity W-prime debits and race checkpoints participate in the same numerical race.

- The new flag is `experimentalFinitePassReservation: true`. It requires `experimentalPowerDurationEnergy: true` and disallows simultaneous automatic anticipatory-lane preparation while this isolated passing study is being calibrated.
- Before the maneuver, the existing swept-corridor lane planner must propose a safe adjacent lane after a blocked movement. The option selects only one blocked rider at a time, within the initial **5 km**, with an eight-tick minimum interval between maneuver starts.
- The pass is pending for **three 10-second ticks**. During preparation the rider is restricted to the source lane, while destination-lane clearance against all active bicycles is rechecked each tick. An unsafe trajectory rejects the reservation; no forced pass, no teleportation and no extra forward metres.
- The experiment reserves **35 additional mechanical watts** while preparing, subtracts those watts from the available forward-motion power budget, and adds the actual passing-power demand to the rider's **same accepted W-prime energy step** as actual road-motion watts. It does not apply a second ad hoc energy debit. Rejected maneuvers retain their attempted mechanical-work cost.
- The full passing state (pending rider/lane/ticks, cooldown, attempts, completions, rejections and joules) is part of the serialized `CoupledStateV3` research checkpoint. The research-only result explicitly reports passing metrics.
- No finite-passing state, change or side effect exists when the opt-in flag is absent. The authoritative production race engine and selector are still separate.

**Physical caveat:** The algorithm reserves a future lane for three discrete ticks, then changes the integer lane. It does **not** model interpolated steering or simultaneous physical bicycle occupancy across both lanes. Neither 35 W nor 30 seconds is a measured realistic pass cost. The experiment must not be presented as sporting-calibrated passing dynamics.

## Actual complete-race A/B

Both arms use identical frozen rider roster, orders, grid, geometry and provisional physiology. Only the opt-in passing option differs; energy-only W-prime V3 is the control. `grid_B` is the previously used alternate deterministic neutral starting seed. All 106 or 168 riders finish in each case. Positive blocked-tick changes are worse.

| Fixture and grid | Attempts | Completed | Rejected | Extra passing work (J) | Δ blocked rider-ticks | Δ last-rider gap (s) | Changed finish ranks | Reversed finish-order rider pairs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Dordrecht, 106, original | 6 | 4 | 2 | 4,900 | **+2,810** | 0.000 | **88 / 106** | 467 / 5,565 |
| Dordrecht, 106, grid B | 6 | 5 | 1 | 5,950 | −4,578 | +0.346 | **95 / 106** | 908 / 5,565 |
| Guangxi, 168, original | 5 | 4 | 1 | 4,550 | **−7,238** | −130.235 | **152 / 168** | 1,891 / 14,028 |
| Guangxi, 168, grid B | 6 | 5 | 1 | 5,600 | −5,356 | **+75.008** | **159 / 168** | 1,777 / 14,028 |

In all four cases, every rejected maneuver was charged for its actual attempted preparation ticks. Successful full three-tick passes cost 1,050 J of provisional additional mechanical work each; the resulting 4,900/5,950/4,550/5,600 J values match the observed number of attempted ticks. However, this metric is **not** an independently calibrated real-world rider measurement.

## Findings

1. **Energy is now coupled technically.** The maneuver's forward speed responds to its extra power demand, and actual (not simply desired) mechanical motion plus passing overhead flows into one accepted finite W-prime state advance. Full-race checkpoint JSON serialization/restart equals the corresponding uninterrupted run exactly.
2. **Finishing order remains unstable.** Even a handful of early passes changes **88–159** finishing ranks. In Guangxi the alternate seed B gets *less* blocking but a **75-second wider** last-rider gap. Blocking alone is not an adequate sporting-quality acceptance metric.
3. **Dordrecht is contradictory.** The same passing strategy improves blocked rider-ticks in grid B by 4,578 while making the original grid worse by 2,810. The finishing rank changes are widespread in both.
4. **No credible true-race calibration yet.** The first passing maneuvers are triggered by the research solver's blocking and safe-lane heuristic, not measured cyclist steering decisions. Discrete lane occupancy, strength/attack strategy, draft, fatigue and formation feedback produce amplified downstream differences.

### Technical verification

- [Batch 31 complete 106/168-roster A/B, finite-passing invariants, strict TypeScript, checkpoint equivalence and application build — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40313530638).
- [Full V3 legacy-isolation and full-roster regression — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40313530516).
- [Batch 22 W-prime baseline regression — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40313530539).
- [Batch 23 per-rider diagnosis — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40313530537).
- [Batch 24 aerobic-power comparison — **SUCCESS**](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40313530506).
- The initial CI run on `9b72580e` failed strict TypeScript narrowing around guarded lookups; the small follow-up at `53c24bec` fixed those annotations before any success was claimed. All relevant GitHub checks subsequently passed.
- Two GitHub Actions artifacts, `v3-batch31-dordrecht-2000-10-15` and `v3-batch31-guangxi-2000-10-19`, preserve each complete finish order, rider-energy summary, attempts, completions, rejections, passing work and checkpoint batches through 2026-11-25.

## Sporting blockers and next step

- Guangxi's frozen geometry still omits 718 m of the reported climb; Dordrecht maps eight sprint-points commands to tempo; weather and W-prime capacities are provisional.
- Relative finishing order changes remain extraordinarily large from tiny early physical-position changes. One seed showing fewer blocked ticks does **not** establish realism.
- The passing reservation lacks interpolated lateral steering, physical joint occupancy, reaction time and validated cost of standing/sprinting.
- **Batch 32 recommendation:** run structured multi-seed sensitivity for maneuver duration, 35 W overhead, start time and rider-selection criteria, with segment-specific rider-level energy and leader-gap traces. Add safety cases for target-lane cut-ins and finish-line interruption. Resolve missing Guangxi elevation before realistic mountain calibration.
- Maintain fail-closed research-only gating, zero official writes, unchanged default-mode output, exact serialized checkpoint restarts, and full application/regression gates.

**Final recommendation: SPORTING NO-GO.** Do not route official races to V3, re-run old results, or modify game clocks.
