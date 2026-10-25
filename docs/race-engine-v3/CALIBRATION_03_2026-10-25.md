# Race Engine V3 — Calibration Batch 3 (25 October 2026)

**Research-only. Sporting acceptance: FAILED / NOT YET PROVEN. Production game remains paused.**

## Scope
A completely separate physical simulation core now lives under `src/race-engine-v3/`. Legacy Baseline, Mountain V2, Breakaway V1, current UI, engine selector and four live production workers remain untouched. V3 is never selected for official racing.

- `physicalRaceEngineV3.ts`: isolated deterministic per-rider motion, fatigue, draft, attack/chase orders, replay samples, resumable checkpoints.
- `physicalGroupsV3.ts`: replay group membership and gap projection from physical positions, with one group per rider; B1 disappears automatically after a physical catch.
- `routeFidelityV3.ts`: checks coarse elevation profiles against declared total gain and recorded KOM climbs. Never manufactures gradient or a target gap.
- `scripts/v3/verify-physical-race-engine-v3.mjs`: 12 deterministic synthetic regression tests.
- `scripts/v3/verify-route-and-groups-v3.mjs`: catch/uniqueness and Guangxi missing-profile safety tests.
- `scripts/v3/verify-dordrecht-real-roster-v3.mjs`: frozen 106-rider, 18-team flat-field benchmark with saved phase orders and three weather scenarios.
- `scripts/v3/verify-guangxi-real-roster-v3.mjs`: frozen 168-rider, 22-team mountain-field benchmark without mapped team orders.

## Engineering outcome
Local Node 22 research tests: 12 of 12 synthetic tests passed, pure group and route tests passed, full Dordrecht and Guangxi runs completed with deterministic checkpoint/resume and one unique finish per rider. TypeScript strict compile passed.

### Flat — Dordrecht 118.5 km
Source run `635ca0b9-7478-4fff-9599-a562060f4ef9`, frozen input MD5 `504424f871e94654079f4e54ba2e5235`.

| Provisional weather assumption | Winner's official time group | Last rider's gap |
|---|---:|---:|
| Calm, dry | 11/106 | 505 seconds |
| 8.8 km/h effective crosswind, dry | 27/106 | 428 seconds |
| Full 22 km/h crosswind, provisional wet | 13/106 | 511 seconds |

These are **sensitivity scenarios**, not verified in-race weather; the source has wind direction but no road bearings, and rain probability is not a wet-road observation. This version corrects the extreme starting-energy/ordinary-effort depletion that previously produced 34-minute flat-race tails. It does not yet establish acceptable group distribution or breakaway probability.

### Mountain — Guangxi 165.8 km
Source run `bb6aaf57-a291-426d-a252-b9981b4bc578`, frozen input MD5 `babdde9fd07d315bf59974cc46dde67d`. V3 first frozen mountain roster result: **168 completed, 1 at winner's time, +117 seconds final rider, 61 distinct official times, 21 of 25 best climbers among top 25 finishers**. All statistics are experimental simulation results, not rewritten official results.

**Blocking route-data finding:** the coarse elevation points represent **1,000 m** of positive ascent against the stage's claimed **1,718 m** elevation gain. There are three additional real source climb annotations (72 km / 4.9 km at 4.7%; 134.2 km / 3.0 km at 4.8%; 165.8 km / 3.2 km at 6.8%), but these cannot uniquely reconstruct the missing 718 m of climb geometry. The routing gate reports the profile incomplete. Never force extra finishing gaps to hide this missing physical input.

## Known limitations and mandatory next steps
1. Reconcile verified course geometry and summit climb positioning; current mountain realism cannot be accepted with an incomplete profile.
2. Determine road-segment bearings and meaningful wind/precipitation measurements before claiming crosswind realism.
3. Calibrate group cohesion, transitions, B1 identity persistence, chase cooperation, attrition, high-fatigue riders, and tactical sprint finishes against more than these two events.
4. The group projector labels groups from physical positions but does **not** yet supply stable historical group IDs for a live commentary timeline.
5. Real Guangxi pre-race commands, weather heat physiology, AI team tactics, point classifications, TT/TTT, publication and live player command interaction are not yet integrated.
6. Verify the dedicated GitHub Actions V3 workflow read-back; the local test result does not establish a passing remote CI run.
7. No production pilot, game clock resumption, legacy engine removal or official output write is authorized.

## Safety and game clock
No Supabase mutations in this batch. Preserve both clock pause flags and the existing published race history. Game clock multiplier is still stored as **12x** even while paused; configuring it to the agreed **2x** requires a separate safe clock reconciliation before future explicit resumption. The new modules are in an isolated directory and excluded from the legacy engine import path.

**Verdict: isolated engineering integration progressed; sporting-quality gate remains CLOSED.**
