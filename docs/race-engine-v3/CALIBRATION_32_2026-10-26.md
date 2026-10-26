# Race Engine V3 — Batch 32: finite passing parameter and selection sensitivity

**Date:** 2026-10-26  
**Implementation:** [ae9a2edccaca743143592949a50541d96ad9e8c6](https://github.com/bracko87/ProPeloton-Manager/commit/ae9a2edccaca743143592949a50541d96ad9e8c6)  
**Validation workflow:** [3f6fc52c8c9284a4716daff1283d54c9115a4295](https://github.com/bracko87/ProPeloton-Manager/commit/3f6fc52c8c9284a4716daff1283d54c9115a4295)  
**Decision: TECHNICAL PASS; SPORTING NO-GO; OFFLINE RESEARCH ONLY.** Zero official writes, unchanged official racing selector, no historical result changes or race-clock operations.

## Question

Batch 31 implemented a three-tick, +35 W finite passing reservation, debited in the same W-prime step as achieved mechanical motion. The rider field remained highly sensitive: 88–159 riders could change finish rank after only a handful of maneuvers.

Batch 32 asks whether that response is specifically caused by the 30-second duration, the +35 W demand, the first-by-rider-ID selection heuristic, or the permissive first-5-km passing window.

## Experiment

The **new settings are accepted ONLY when `experimentalFinitePassReservation:true`**. With no settings, the numerical algorithm remains exactly the previous Batch 31 default (3 ticks, +35 W, rider-ID selection, first 5 km). Other permitted research conditions:

- Duration shortened to 2 ticks or lengthened to 4 ticks (while keeping +35 W).
- Extra mechanical demand lowered to 20 W or raised to 50 W (while retaining 3 ticks).
- Prefer riders with the highest accumulated wheel-blocked ticks instead of first rider ID.
- Allow the passing reservation to start only in the first 2 km instead of 5 km.

Each alternative changes **one variable at a time**. The same Dordrecht frozen roster (106 riders) and Guangxi frozen roster (168 riders) were run in both their original neutral grid and alternate grid B. Each grid has the W-prime-only untreated control, the unchanged Batch 31 default, and six parameter alternatives. This yields **32 primary complete-race runs** plus **16 full serialized-checkpoint replay comparisons**.

All riders complete in every tested run; no stage tables are written. The passing mode remains **disabled by default**, requires the separate W-prime experimental mode and refuses the simultaneous automatic lane-preparation mode. A parametric resume with a mismatched config fingerprint is rejected. The stored finite-passing reservation duration must match the selected config.

## Results A — blocking sensitivity (change from Batch 31 default)

Negative means **fewer** blocked rider-ticks; positive means **more**. These represent repeated rider-ticks, not unique riders. The paired starting grid and all rider attributes, routes and tactics are held fixed.

| Passing condition | Dordrecht original | Dordrecht grid B | Guangxi original | Guangxi grid B |
|---|---:|---:|---:|---:|
| 2 ticks, +35 W | −258 | **+11,520** | −14,077 | **+6,708** |
| 4 ticks, +35 W | −5,420 | −2,424 | −3,642 | **+11,190** |
| 3 ticks, +20 W | −6,408 | **+27,366** | −16,460 | **+9,026** |
| 3 ticks, +50 W | +2,521 | **+11,090** | −8,436 | **+19,543** |
| Most-blocked-rider selection, 3 ticks/+35 W | −2,603 | +1,914 | −10,412 | +4,770 |
| Starts confined to first 2 km | −4,414 | **+13,016** | +4,392 | +8,373 |

**No alternative produces fewer blocked ticks in all four conditions.** A lower power cost does not guarantee better flow: +20 W is relatively favorable under the original grids but markedly worse in the alternate grids.

## Results B — rank and gap instability

Selected examples compare the altered setting against the exact same-grid **Batch 31** default (not official racing):

| Race/grid/parameter | Finishing ranks changed | Reversed rider-pair finish order | Last-rider gap change |
|---|---:|---:|---:|
| Dordrecht original, 2 ticks | 96 / 106 | 954 / 5,565 | 0.000 s |
| Dordrecht grid B, 2 ticks | 101 / 106 | 1,106 / 5,565 | +74.337 s |
| Dordrecht original, 4 ticks | 82 / 106 | 448 / 5,565 | 0.000 s |
| Dordrecht grid B, +20 W | 101 / 106 | 1,141 / 5,565 | +74.327 s |
| Guangxi original, 2 ticks | 158 / 168 | 2,046 / 14,028 | +130.059 s |
| Guangxi grid B, 2 ticks | 158 / 168 | 2,502 / 14,028 | +65.999 s |
| Guangxi original, +20 W | 153 / 168 | 1,768 / 14,028 | −0.041 s |
| Guangxi grid B, +20 W | 157 / 168 | 2,265 / 14,028 | +46.920 s |
| Guangxi original, first 2 km only | 147 / 168 | 1,485 / 14,028 | +127.231 s |
| Guangxi grid B, first 2 km only | 159 / 168 | 1,953 / 14,028 | −51.962 s |

Even an apparently flat **last-rider** gap change may hide 82–101 differently ranked riders in Dordrecht. In Guangxi, a mere change of reservation duration can reverse more than 2,500 rider-pair orders. Do not adopt a setting based on blocking counts, finish spread or a single grid.

## Extra passing energy and clearance remain finite

The accepted single-tick overhead is now either 20, 35 or 50 W, debited **in the existing achieved mechanical work / W-prime update**, not through a second ad hoc fatigue debit. For example:

- Dordrecht original: 2-tick/35-W maneuver produced 6/6 completed attempts and 4,200 J additional mechanical demand; 4-tick/35-W produced 5/6 completed and 7,350 J.
- Guangxi original: 2-tick/35-W produced 4/5 completed attempts and 3,150 J; 3-tick/20-W produced 3/5 completed and 2,200 J.
- Each attempt is checked for swept corridor clearance; an aborted maneuver keeps the cost already incurred.
- Tests reject invalid duration, unknown options, unconfigured sensitivity use and checkpoint fingerprint mismatch. Complete checkpoint serialization/restart exactly matches the uninterrupted run for the original grid across every parameter and the default across grid B.
- The data still represent provisional W-prime mechanics, **not** validated real cyclist energetics or continuous lateral bicycle steering.

## Technical verification

- [Batch 32 strict TypeScript, parameter/energy unit tests, full-race matrices, exact restart tests and application build — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40315672481)
- [V3 legacy isolation and full-roster regression on the same commit — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40315672408)
- [Previous Batch 31 regression with the parameterized engine — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40315504557)
- Earlier Batch 22–24 research regressions with the parameterized engine also completed successfully before the new runner was added.

Source changes are narrowly limited to **research-only** `coupledRoadRaceResearchV3.ts` / `finitePassingResearchV3.ts`, a Batch 32 script pair, and a dedicated workflow. No production selector, workers, database tables, payout logic or game-clock settings were altered.

Complete original-grid and grid-B rider finish orders, pass counts, blocked-tick deltas, W-prime metrics and checkpoint diagnostics reside in GitHub Actions artifacts `v3-batch32-dordrecht-2000-10-15` and `v3-batch32-guangxi-2000-10-19`, retained for 30 days.

## Limitations and Batch 33 priority

1. The frozen Guangxi route is missing **718 m of reported climbing**; Dordrecht sprint-points commands remain approximated as tempo. Thus apparent climbing/mountain impacts cannot be sporting-calibrated.
2. Only two deterministic synthetic starting grids were tested per race. This is neither a statistical confidence interval nor representative rider tracking.
3. The road-width model uses discrete lanes, not joint lateral occupancy and continuously interpolated steering. Passing power costs and durations are hypotheses.
4. The driver of outsized rank changes seems to involve **early geometric path dependence and rider interactions**, not a single wrong 35 W value or duration. This observation is descriptive, not conclusive proof of causality.
5. **Batch 33:** prioritize tracing first overtaking and blocked-lane divergence with multiple alternative grid perturbations under controlled rider power, then resolve early peloton dynamics and missing route/source calibration. Do not introduce automatic sporting changes just to reduce blocked ticks.

**Final decision: SPORTING NO-GO.** Keep official V3 disabled; do not change game clocks, official races or recorded results.
