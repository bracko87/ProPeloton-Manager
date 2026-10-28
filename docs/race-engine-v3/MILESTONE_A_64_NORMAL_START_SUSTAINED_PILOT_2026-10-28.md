# Race Engine V3 — A64: sustained ordinary-grid starts, dynamic corridor passing and fail-closed crowded pelotons

**28 October 2026. Isolated engineering pilot PASS; sporting, full-stage and production readiness NO-GO.**

## Scope shift after the short-field A63 gate

A63 completed **67/67** previously selected 2–32 rider, 10–12.5-second physical field replays without swept collision. That proves the bounded physics controls on a narrow, historically selected stress corpus; it does **not** prove sustained racing. A64 deliberately breaks dependence on A44 source checkpoint histories, retrospective contact events or preselected responding rider IDs.

A64 introduces [`a2NormalStartPelotonV3.mjs`](../../scripts/v3/a2NormalStartPelotonV3.mjs), a separate research-only synchronous field integrator initialized at **t=0** from reproducible staggered grids of 8, 32, 106 and 168 riders. Each cyclist owns only current x/y position, velocity, a speed target, lane intent and provisional W-prime ledger. Every **0.5 seconds**, the field recomputes bounded commands, an opt-in nearby free-lane target and the existing A61 three-second current-state upstream warning. All accepted rider moves are integrated together; continuous all-pair conservative swept segments catch collisions and reject the **entire step** with no retroactive rescue. W-prime is charged for committed motion and 35W provisional lateral steering overhead.

No replay reads future A44 accepted trajectories, selected collision victims, an oracle, later rider positions or real race results. Race progress and last rider gaps are measured in metres. The same state can be serialized, restored and stepped again with identical output. All findings apply only to the provisional **5-lane / 1.1m centre spacing / 0.8m lateral collision** synthetic geometry. Road width is NOT source-confirmed.

## Tests and measured evidence

The [validation harness](../../scripts/v3/verify-a2-step64-normal-start-v3.mjs) is linked into the retained [A59–A64 CI workflow](https://github.com/bracko87/ProPeloton-Manager/actions/workflows/v3-a2-step59-symmetry-and-field.yml), which also retains the A63 **67/67** short-field gate and older technical regressions and React build.

| Normal-start test | Intended duration | Accepted simulated seconds | Outcome | Rider order reversals at endpoint | Physical lane changes completed |
|---|---:|---:|---|---:|---:|
| 8 riders, even speed | 90s | 90s | CLEAR | 0 | 0 |
| 32 riders, even speed | 120s | 120s | CLEAR | 0 | 0 |
| 106 riders, even speed | 30s | 30s | CLEAR | 0 | 0 |
| 168 riders, even speed | 30s | 30s | CLEAR | 0 | 0 |
| 8 riders, varying speeds, five lanes filled | 90s | 90s | CLEAR | 11 | 2 |
| 32 riders, varying speeds, five lanes filled | 90s | **24.5s** | **SWEPT CONTACT** | 31 before rejection | 0 |
| 32 riders, aggressive changing speeds, five lanes filled | 90s | **8.5s** | **SWEPT CONTACT** | 23 before rejection | 1 |
| 8 riders, varying speeds, outer lanes free | 90s | 90s | CLEAR | 11 | 5 |
| 32 riders, varying speeds, outer lanes free | 90s | **90s** | **CLEAR** | **118** | **22** |

**Reproduction of failing crowded cases:** the first rejected pair is **r015/r020** on both fully occupied 32-rider grids, with their first detected conservative contact at **24.65625s** (mixed) and **8.90625s** (aggressive). The entire move is rejected, not modified after contact. These failures are primary evidence that the current lane-admission/headway model is **not** sufficiently safe for real racing.

**Positive nontrivial corridor case:** the 32-rider three-column initial field intentionally leaves outside passing corridors free. In 90 seconds, it completes **22** of **23** initiated lateral movements, records **137** rider-substep steering decisions, **572** bounded braking rider-substeps and **118** initial-to-final *longitudinal pair order reversals*, with **zero** detected swept collision and no W-prime/time violation. Pair order reversals are **not** individually traced overtaking maneuvers or calibrated sporting ranks; the collision test checks every accepted physical segment.

**Critical qualification:** the easy 106/168-rider tests are merely 30-second straight-tempo smoke runs with **zero overtakes, zero lane changes and no close swept-pair checks**. They cannot be used to claim dense peloton safety, race physics scaling to real racing, or completed 106/168 stages. The provisional steady grid maintains its original formation; this is intentionally diagnosed instead of being praised as realism.

## Determinism and symmetry controls

- A standard **32-rider, 120s** safe reference completes exactly **240 x 0.5s** physical steps. Serializing its state after **60s** and resuming 60s produces exact deep-equal finish state and counters. The matching road-reflected and ID-renamed grids preserve positions and W-prime.
- The nontrivial **32-rider corridor**, 90s test retains exact deep-equal serialized recovery at **45s**. Road reflection preserves the 90s physical x progress and reflected y, and rider-ID renaming preserves same x progression; W-prime is invariant. The test requires actual nonzero completed lane changes and final-order changes, not a trivial static safety pass.
- A deliberately pre-overlapping 8-rider initial state is rejected at **time 0**, with 0 committed steps. In live gameplay an invalid grid would need an explicit safe start-grid placement policy rather than starting the race overlapped.
- All technical research scripts report **0 official writes** and **sporting approval NOT_APPROVED**.

## What is missing before playable racing

This implementation proves **a proper nonclairvoyant normal-start testing environment exists**, with important realistic failure measurements. It is still NOT the full approved player race engine: there are no terrain-driven speeds, genuine aerodynamic drafting, fatigue calibrated from source rider traits, sprint physics, actual route road-width profiles, power-limited speed control under severe attacks, teams/responding tactics, stage lengths, real breakaway formation/gaps, rider classifications or production scheduler integration. Provisional research power curves can recover W-prime over these relatively low-intensity short windows. Successful safety alone does not certify credible fatigue or tactics.

**Milestone A sporting NO-GO; Milestones B and C NOT STARTED.**

## Next A65 acceptance target

Reproduce the **r015/r020** dense-grid closure without hindsight and identify whether the gap or planned lateral space is already unattainable under 0.85m/s² normal braking. Introduce bounded *coordinated corridor/merging decisions*, not larger emergency decelerations or teleports. Extend sustained 32-rider mixed-speed tests to 120–600s with varied grids, actual persistent pass traces, honest group-gap measurements and rotating/mirrored/renamed fairness controls. Then increase **interactive**, rather than steady-paced, 106/168 rider coverage and progressively integrate route and power data. Maintain all A63 and earlier regression gates.

**No production race, Supabase database, race result, payout, game clock or Netlify racing switch was modified.**
