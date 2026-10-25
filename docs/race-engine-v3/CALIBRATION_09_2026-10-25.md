# Race Engine V3 — Calibration Batch 9 (25 October 2026)

**ISOLATED RESEARCH — SPORTING NO-GO.** No production calculation worker, legacy engine, live race, published result, payout, or game clock setting changed.

## Implemented: authoritative physical-group checkpoint persistence

Prior batches could derive stable B1/G1/peloton identities by replaying physical positions after finishing, but the simulator's persisted checkpoint contained only rider motion and separate replay frames. That made authoritative live/replay group continuity a future integration risk.

The research-only `src/race-engine-v3/physicalRaceEngineV3.ts` now:
- Initializes a physical-group timeline together with the rider simulation.
- Advances group lineage **at the same time** as each immutable-intent replay sample, including a final sample created between ordinary replay intervals.
- Persists previous physical positions, group IDs, merge/catch/finish events and rider assignments inside the serializable calculation checkpoint (`state.groupTimeline`).
- Exposes `result.groupFrames`, derived exclusively from authoritative sampled rider trajectories; no parallel post-hoc invented race narrative.
- Rejects checkpoints with a missing/mismatched group timeline or different replay/group-frame counts.
- Keeps the actual velocity, energy, existing attack orders and finish calculation **unchanged**. No new physics controller was integrated.

Added `scripts/v3/verify-authoritative-group-checkpoints-v3.mjs`, a fail-closed regression over both frozen historical rosters. The dedicated V3 GitHub Actions workflow now runs it.

## Locally verified execution
Node 22.16.0; TypeScript 5.8.3 strict validation. Existing synthetic physics, wind, route-fidelity, B1 lineage, energy, attack-catch and cooperative-pursuit helper tests passed. The full Dordrecht and Guangxi roster calculations finished and preserved historical *research simulation* output compared with Batch 8:

| Frozen isolated test | Riders | Winner-time group | Final rider gap | Authoritative replay/group frames |
|---|---:|---:|---:|---:|
| Dordrecht, unverified road bearings (neutral exposure) | 106 | 5 | +413.93 seconds | 192 |
| Guangxi, incomplete coarse route | 168 | 1 | +117.25 seconds | 263 |

Both simulations were repeated with small, irregular checkpoint batches, serializing the full state between batches. Compared with uninterrupted calculation, **the entire result object matched**, including every finishing time, replay sample, physical group ID, merge/finish event and rider assignment. The regression checks one unique assignment per rider per group frame, that all final riders are `FINISHED`, and that a corrupted checkpoint is rejected. The uninterrupted real-roster calculation remained deterministic.

## Rejected: experimental activation of cooperative chase
I tested enabling the existing shadow `cooperativePursuitV3` plan inside a local copy of the active research solver, with extra energy cost deducted from actual chase contributors on every tick. It **failed** the sporting regression:

| Dordrecht, same saved orders and neutral weather | Winner-time riders | Final rider gap |
|---|---:|---:|
| Unchanged V3 motion solver | 5/106 | +413.93 s |
| Local active cooperative chase experiment | **101/106** | +276.60 s |

Guangxi was unchanged at +117.25 s (its frozen benchmark has no equivalent saved team chase orders).

A small cooperative pace increase coupled to the present drafting chain causes excessive bunch recombination. Passing isolated helper tests is insufficient. **The failed active-chase implementation was NOT committed.** `cooperativePursuitV3.ts` remains a standalone research/shadow helper and is not imported by the physical solver.

## Remaining blockers / next milestone
1. Replace rider-to-adjacent-rider velocity inheritance with a true collective speed/power and aerodynamic model. The existing solver is highly sensitive to a modest additional chase gain.
2. Make the authoritative group timeline drive physical catch classification with consistent pack thresholds rather than computing a separate largest-group proximity proxy.
3. Validate pace versus sustainable power and energy expenditure for cooperating workers without mass finishing times; use multiple flat/hilly/mountain rosters, different team commands and weather.
4. Recover verified route bearings, wind exposures and Guangxi's missing 718 m profile ascent before sporting approval. Never script gaps or reclassify failed physics as realistic.
5. Build actual 12 live tactical sectors, idempotent official publication, 15-minute performance and Game Control Center only after physically realistic racing is demonstrated.

## Deployment and controls
Only files under `src/race-engine-v3/`, `scripts/v3/`, the dedicated V3 test workflow and this report changed. All legacy engines, production workers and existing official data are untouched. The V3 source is disconnected from the production engine selector; neither an official V3 race nor its results were generated.

All local research tests and strict typechecking passed; **remote GitHub Actions run, full application build and Netlify deployment were not independently confirmed**. The fact that the code is on `main` does not confer permission to activate V3.

The authoritative game clock remains paused at **Season 1, 20 October 06:38**. The secondary clock remains paused; its stored multiplier is still **12x**, not yet switched to the future approved 2x. Do not restart or change clocks without separate explicit authorization.

**Decision: checkpoint/replay integrity milestone complete; cooperative-chase physics and sporting acceptance remain blocked.**
