# Race Engine V3 — Calibration Batch 5 (25 October 2026)

**Research only. Sporting acceptance: NO-GO. Existing race-engine selector, production workers, official results and game time remain untouched.**

## Completed and locally validated
1. Added `src/race-engine-v3/windExposureV3.ts`: pure relative-direction wind projection from *wind FROM* compass bearing and verified route heading. Produces signed headwind/tailwind and crosswind magnitudes. **If road bearing is absent, returns null rather than inventing a crosswind.**
2. Added `scripts/v3/verify-wind-exposure-v3.mjs`: verifies headwind, tailwind, crosswind and wind-vector magnitude conservation across 52 heading samples; validates error handling and absent bearing.
3. Corrected the **frozen Dordrecht research runner**, which previously assumed 40% of reported wind as crosswind whenever the bearing was unknown. Default `forecast_unknown_bearing` is now neutral (0 assumed wind exposure) and clearly flags `roadBearingVerified=false`. Explicit `worst_crosswind` remains a *synthetic stress test*, not a historical weather claim. Rain probability remains distinct from measured wet roads.
4. Added `scripts/v3/report-calibration-sensitivity-v3.mjs` to run the real 106-rider flat roster under neutral/calm/strong synthetic crosswind and the 168-rider Guangxi mountain roster; asserts deterministic checkpoint completion and records key comparisons. **It always records `sportingAcceptance: NOT_APPROVED` rather than treating simulation completion as physics validation.**
5. Added these checks to the isolated V3 GitHub Actions workflow without removing or weakening the original race-engine validation.

## Frozen real-roster results (unchanged V3 motion core)

| Scenario | Winner's official time | Final rider gap | Distinct official gap values | Leading group at 5% |
|---|---:|---:|---:|---:|
| Dordrecht — no road bearing; neutral assumption | 11 / 106 | +505.20 s | 4 | 97 |
| Dordrecht — explicit strong 22 km/h synthetic crosswind | 13 / 106 | +511.03 s | 4 | 4 |
| Guangxi — coarse mountain profile | 1 / 168 | +117.25 s | 61 | Not comparable |

A major anomaly is now reproducible: a provisional weather exposure switches the early largest/leading group from 97 riders to only four. Wind physics, drafting and peloton cohesion remain too sensitive. The neutral condition is **not a claim of historically calm weather**; it merely prevents a fabricated directional assumption.

## Rejected local physics experiments
- Blocking all passive drafting behind an attacking rider created approximately **555 m of separation in only 2 km** in a controlled equal-skill test. Although the existing synthetic test suite passed, that attack opening was not independently calibrated; the candidate was **rejected, not committed**.
- Adding a small shelter-based energy discount (including a 5% discount) could change the frozen Dordrecht result to **95 riders on the winner's time**; stronger discounts also produced all-rider mass finishes. These local experiments were **rejected, not committed**.
- The abrupt response to modest coefficient changes indicates a discontinuity in the pack/escape control logic, not simply a need to choose a more attractive draft multiplier. Optimize no single metric by assigning synthetic group counts or artificial time gaps.

## Validation and preservation
- Local Node.js 22: 13 synthetic race-core regression tests passed; route/group lineage and wind-vector tests passed; both frozen real-roster runs and the multi-weather sensitivity harness passed *engineering integrity*.
- Strict TypeScript typecheck of all research engine modules passed locally.
- GitHub V3 CI workflow updated. **Remote workflow completion and full application build have not been independently verified.**
- No production Supabase reads changed data. No live V3 worker, replay UI, live orders, sprint/points outputs or official publishing exists yet.

## Next focused correction
Replace the current abrupt peloton/escape logic with a continuous, physically sustainable attack-response model. In particular, attacking riders should not pull uncommanded riders up to full attack speed via free drafting, and reducing drafting by a small amount must not abruptly collapse or completely reunite the field. Test on several independent real rosters and wind bearings when available; do not use stage-specific scripts.

Guangxi still has **718 m** of unrepresented declared ascent in its sparse profile. Do not fabricate gradients to match result expectations.

**Production hold:** authoritative game clock remains Season 1, 20 October 06:38; `game_state` and `game_clock_config` must remain paused, with the stored `12x` multiplier unchanged until an explicitly authorized, safe future switch to `2x` and restart.
