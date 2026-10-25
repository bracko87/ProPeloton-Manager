# Race Engine V3 — Calibration Batch 19 (25 October 2026)

**Scope: isolated integrated V3 engine. Diagnostic engineering: PASS. Sporting realism: NO-GO. No production changes or clock operations.**

## What changed

Added the optional and checkpointed `src/race-engine-v3/wheelBottleneckTelemetryV3.ts` to the offline integrated research engine. The new `experimentalBottleneckTelemetry: true` flag is **disabled by default**.

Every actual 10-second physical tick can now record **requested versus achieved longitudinal travel**, de-identified per-rider blocking duration, consecutive blocking streaks, and congestion by distance quarter. Blocking attribution is coarse: another bicycle ahead in the same lane, a lane-change reservation, or other. These are **observational diagnostics**, not commands to accelerate, teleport, alter rider power, or reassign a finishing time.

The diagnostic state is serialized within the existing authoritative checkpoint. The full calculation with telemetry ON is identical to the reference calculation with telemetry OFF in finishing times, rider energy, physical trajectory, replay frames, group lineage and work totals. The telemetry output is the only added result field, and sporting approval is still hard-coded `NOT_APPROVED`, with `officialWrites: 0`.

## Two complete roster-size research audits

**All per-rider input stand-ins in these public simulations are explicitly synthetic.** They are not original measured watt data or source-complete historic predictions. Guangxi also lacks 718 m of its declared ascent in its coarse elevation profile.

| Metric | Dordrecht: 106 riders, 118.5 km | Guangxi: 168 riders, 165.8 km |
|---|---:|---:|
| Finished | 106 | 168 |
| 10-second calculation ticks | 1,404 | 1,783 |
| Wheel-limited rider-ticks | **66,928** | **145,773** |
| Percentage of active rider-ticks wheel-limited | **51.8926%** | **51.9697%** |
| 90th-percentile rider blocking fraction | 99.6013% | 87.8806% |
| Longest continuous wheel-limited streak | **1,250 ticks (208m20s)** | **706 ticks (117m40s)** |
| Attributed to another rider ahead in same lane | 66,916 | 145,735 |
| Attributed to lateral-change reservation | 12 | 37 |
| Unattributed blocked rider-ticks | 0 | 1 |
| Sum of prevented requested movement across rider-ticks | 580,626.5 m | 1,023,724.5 m |
| Final rider gap, **identical to Batch 18** | +2,694.469 s | +2,001.083 s |
| Exact serialized checkpoint restart batches | **36** | **45** |

**Interpretation:** riders are repeatedly wheel-limited in the same lane, often for extremely long consecutive periods. This is strongest in the early race and is compatible with the existing engine's unrealistically long finishing gaps. The data *does not prove all wheel following is wrong*; cyclists must preserve safe gaps. The pathologic duration and outcome are the blockers. The aggregate prevented distance is the sum of many unrelated riders' attempted travel, **not a legitimate catch-up distance or official race time penalty**.

### Location of congestion

| Rider's distance quarter | Dordrecht: fraction of active rider-ticks blocked | Guangxi: fraction blocked |
|---|---:|---:|
| 0–25% | **69.0719%** | **78.9812%** |
| 25–50% | 59.8151% | 57.3695% |
| 50–75% | 44.7403% | 46.2062% |
| 75–100% | 33.3742% | 29.6310% |

Distance quarters are rider-progress based, not four equal clock-time periods. Much of the bottleneck begins in the first quarter.

## Rejected local motion correction (NOT COMMITTED)

A two-second multi-step passing planner was tested in an isolated local copy, with longitudinal microsteps and collision-aware lateral slot changes. It passed syntax, strict TypeScript and short-race safety checks, but allowed an implausibly large number of passes **while worsening both test tails**:

| Synthetic 3-km field | Current integrated tail | Rejected substep candidate tail | Candidate passes |
|---|---:|---:|---:|
| 106-rider Dordrecht-size | +57.769 s | **+79.018 s** | 645 |
| 168-rider Guangxi-size | +33.075 s | **+70.121 s** | 748 |

The candidate was **removed before publication**, not imported by the race engine, not added to GitHub and not deployed. An overtaking-count increase without credible energy/drafting and separation is not acceptable.

## Testing and deliverables

- `scripts/v3/verify-wheel-bottleneck-v3.mjs` checks deterministic classification, nonmutation, consecutive blocking counts, malformed-input rejection, exact ON/OFF rider results and replay equality, serializable counter equality after restart and rejection of a corrupted telemetry cursor.
- `scripts/v3/verify-coupled-race-v3.mjs` supports `V3_BOTTLENECKS=1` and full-race `V3_FULL_ROSTERS=1 V3_FULL_RESUME=1` so the same real-length research stages can be re-run with or without telemetry.
- Both full races reproduced **the complete instrumented result including the telemetry** after 36 and 45 irregular serialized resume batches.
- The dedicated V3 GitHub Actions workflow now runs the focused integrity test and the full-roster telemetry checkpoint test, and strictly typechecks the new module.
- **33 individual public research/test scripts completed successfully locally; the operator-only private source runner was excluded.** The combined terminal command reached its outer timeout during the final TypeScript step; strict TypeScript was therefore rerun independently and passed. Remote GitHub Actions completion, full application build, Netlify deployment and live-game behavior remain independently unverified.
- Public package and repository exclude the private de-identified rider-level source supplement.

## Next sporting acceptance milestone

Use the precise early-stage and rider-streak bottlenecks to design a physically continuous, **collision-free time-based lateral merge** which reduces prolonged overblocking without creating free wattage, forced bunch recovery, unrealistic finishing times or arbitrary stage-specific bonuses. Validate against actual energy demand, physical draft, attacks and chasing, full flat and mountain courses and complete source data. Preserve deterministic resumability and fail if realistic racing is not demonstrated.

**Release safety:** only isolated V3 source, scripts, dedicated V3 test workflow and this report changed. The original V3 motion engine, Baseline, Breakaway V1 and Mountain V2, live worker, results publisher, production race data and game clocks remain untouched.

**Decision: full-race congestion root cause is now measured and checkpointed. The unstable passing candidate is rejected; V3 is still not approved for sporting or official use.**
