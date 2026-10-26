# Race Engine V3 — Milestone A2: early closing-wheel anticipation

**26 October 2026 — RESULT: REJECT CANDIDATE / SPORTING NO-GO.**

The first fully coupled 2D stage and checkpoint gate already passed for 106 Dordrecht and 168 Guangxi riders. The separate A2 priority and overtaking-capacity analyses left large sensitivity to synthetic starting rows. This deliberately narrow study tests whether starting a conservative safe lane preparation **before** two blocked ticks alleviates the problem. It does not.

## Isolated controlled change

Research-only opt-in `experimentalPassingTrigger: 'closing_wheel'` activates a predictive predicate when a rider is within 12 metres of a slower same-lateral-track wheel, has relative closing speed greater than 0.2 m/s, and projects to under 4.5 m after two ten-second reaction intervals. Existing `blocked_2` behavior is preserved as the default, byte-for-byte.

**All other rules unchanged:** 5 m hypothetical road, 1.8 m safety clearance, maximal three active passing reservations, 2 reaction ticks, 3 steering ticks, 35 W extra steering charge, continuous 2D collision checks and existing rider physiology. No future frames used for prediction. No free metres added. No production game engine import, database writes or live clocks.

For each frozen 106/168-rider fixture we ran four complete stages: delayed default with original grid and exactly two starting lanes swapped, then early-trigger with original and swapped grid. All 8 full 2D stage outcomes have 106/168 distinct finish rows and exact serialized checkpoint recovery; before-run micro-fixtures verified default equivalence and checkpoint invariance.

## Results — pair-order inversions comparing original and two-rider lane swap

| Metric | Dordrecht | Guangxi |
|---|---:|---:|
| Rider count | 106 | 168 |
| Existing blocked-2 pair inversion share | 7.619048% | 18.555746% |
| Closing-wheel early pass inversion share | **7.942498%** | **18.555746%** |
| Delta in percentage points | **+0.323450 (worse)** | 0.000000 (no effect) |
| Changed finishing ranks under original/swap | 96→97 | 165→165 |
| Winner changes after the grid swap? | Yes, both settings | No, both settings |
| Original-grid last-rider gap, either policy | 1,193.300376 s | 1,231.182305 s |
| Original-grid blocked rider-ticks, either policy | 92,768 | 208,287 |
| Original-grid completed lateral reservations, either policy | 573 | 905 |

The Dordrecht original-grid classification was **completely unchanged** by the new trigger, while the swapped case finished with 442 inverted rider pairs compared with 424 under the old trigger. Guangxi was unchanged for both grids.

**No improvement to sporting realism or starting-row bias was established.** This early trigger is therefore *not* approved as a default and should not be carried into player gameplay.

## Validation

- [Full 2×4 stage offline acceptance matrix — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40389102530). Both fixture jobs passed source 2D micro safety, interpolated finish, baseline equivalence, new predicate tests, application build, 8 complete stages and exact full-stage restarts.
- [Legacy isolation — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40389102590). The legacy suite remains a technical gate, not sporting clearance; mountain climbing source fidelity and realistic road geometry remain unaddressed.
- All game database writes: **0**. Current official race engine, schedules, historical result tables and clocks unchanged.
- Complete rider results for all four variants per fixture are retained as Actions artifacts for 30 days.

## Next remaining A2 work

Measure and isolate **start-row confinement** by tracking each rider's front/rear queue rank and the percentage of the stage spent behind its original neighboring wheels. Compare real overtaking counts, wheel release and row mobility to improvements in outcome stability; use source-corrected elevation and a varied set of starts. Do not optimize blocked rider-ticks in isolation and do not change the production selector until authentic racing behavior and the owner-approved acceptance gates pass.

**Milestone A1 technical pass retained; Milestone A2 OPEN; Milestones B/C not ready; SPORTING NO-GO.**
