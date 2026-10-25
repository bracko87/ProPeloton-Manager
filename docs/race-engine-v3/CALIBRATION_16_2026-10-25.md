# Race Engine V3 — Calibration Batch 16 (25 October 2026)

**Research-only, sporting acceptance: NO-GO.** No old engine, production worker, game clock, official result, payout or live tactical command path was changed. All feature code is under `src/race-engine-v3/` and defaults to OFF.

## What was implemented

- `pelotonSpatialMotionV3.ts`: a deterministic, finite 1–6-lane physical movement planner, accepting per-rider positions, energy and independently calculated requested speed. It enforces a minimum wheel-to-wheel longitudinal clearance per lane (default 1.8 m), limits lateral moves to one lane per 10-second tick, checks clear swept passing lanes and rejects unsafe bicycle overlaps and backwards movement. Every rider is uniquely identified independent of incoming array order.
- The same pure module computes **location-based drafting exposure** from front-wheel distance, lateral lane offset, wind and climbing gradient. This exposes a research draft fraction; it is NOT yet plugged directly into the collective watt solver because that variant failed full-race tests.
- `experimentalPowerRaceV3.ts`: adds explicit **optional** `experimentalSpatialMotion` with a required `experimentalStartFormation`. When disabled, the previous offline alternative power calculation remains byte-for-byte equivalent. When enabled, each rider's lane and motion constraints persist in the serialized checkpoint, lane is included in replay samples, and extra work for a physically blocked bicycle is reduced while the normal aerobic baseline remains.
- Offline result contains `spatialStats` for passes, wheel-constrained time steps and lane count. Replay/group timestamps and finish interpolation continue to use the same authoritative physical rider state.
- Added `verify-spatial-motion-v3.mjs`, `stress-spatial-motion-v3.mjs`, `verify-spatial-offline-full-v3.mjs`, and `audit-spatial-peloton-v3.mjs`. Added corresponding gates to the dedicated V3 CI workflow.

## Locally verified engineering results

**29 research/regression scripts plus strict TypeScript compilation passed**, including all 26 preexisting V3 scripts, the three new lane/full-roster scripts, and source-complete Dordrecht and synthetic Dordrecht aggregate audits. The test environment used Node.js 22 and TypeScript 5.8.3. The entire same simulation result, physical groups and lane-bearing replay matched uninterrupted output after repeated random-sized checkpoint batches on both 106-rider and 168-rider full stages.

| Independent wheel-placement stress | Riders | Steps / time | Legal lane moves | Blocked wheel steps | Overlapping bicycles |
|---|---:|---:|---:|---:|---:|
| Flat synthetic peloton | 106 | 30 / 300 s | 5 | 1,482 | 0 |
| Large synthetic peloton | 168 | 30 / 300 s | 2 | 2,822 | 0 |

The lane model enforces ordered physically feasible wheel locations, but few successful passes show **overtaking and escape geometry remain too restrictive**. Road width and real start order were hypothetical and not source-verified.

### Dordrecht — actual source attributes kept private

The following metrics contain **only aggregates**. Exact source riders' stamina, resistance, recovery and preparation values were read from the private de-identified source supplement locally and NOT committed to GitHub or placed in the public package.

| Offline research experiment, 106 riders | Largest exact-position/finish-gap cluster | Final rider gap | Recorded passes |
|---|---:|---:|---:|
| Previous all-at-zero reference | 98 | +263.295 s | Not tracked |
| Hypothetical 4-abreast starting grid only | 4 | +208.014 s | Not tracked |
| **4-abreast start + optional spatial wheel movement** | 4 | **+45.950 s** | **1** |

The new wheel constraint greatly **compresses** this race. One physical pass over an entire stage is unlikely to represent convincing race overtaking. The +45.95 s tail is not evidence that race physics is correct. The experiment still relies on unmeasured bike/wheel geometry, an approximate peloton power model, stage weather without verified bearings and simplified team tactics. **Sporting gate remains closed**.

### Historical roster numbers with explicitly synthetic replacement attributes

| Offline synthetic research benchmark | Riders | Last-rider gap | Winner gap ≤1s |
|---|---:|---:|---:|
| Dordrecht full offline simulation without original team orders | 106 | +363.388 s | 24 |
| Guangxi mountain full offline simulation with incomplete source preparation | 168 | +203.713 s | 6 |

Both synthetic full-race tests passed resume determinism and rider uniqueness. They are **not historical sporting predictions** and cannot validate realism. A separate public Dordrecht synthetic-field audit yields +764.796 s for the spatial option, illustrating substantial sensitivity to substituted starting stamina/sharpness/equipment.

Guangxi's sparse profile remains short **718 m** against reported elevation gain. The alternative 77-rider World Nations mountain candidate is missing **1,065 m** of declared ascent. These incomplete geometries forbid mountain sporting approval.

## Rejected local aerodynamic coupling

A candidate directly replacing group shelter with the lane model's local draft fraction was tested, then **rejected**. Its 106-rider synthetic Dordrecht tail grew to **+1,939 s** and the 168-rider synthetic Guangxi tail to **+1,203 s**. It was not committed. Physical drafting has to be calibrated **together** with collective available rider power and proper position/energy accounting, not swapped into a model calibrated to a different average-peloton drag assumption.

## Follow-up acceptance criteria

1. Calibrate lane width, passing clearances, lateral movement duration, braking and safe overtaking using verifiable road/bike physical constraints; stop extreme overblocking while preserving collision safety.
2. Replace inferred draft fractions and group-wide shelter with a mutually consistent, energy-conserving power/aerodynamics model; verify rider fatigue and attack/chase power all race long.
3. Validate physical group continuity, successful genuine attacks, breakaway catch timing and finish-line timing groups across multiple real input-complete routes and independent racing performance evidence. Do not script official finishing groups or gaps.
4. Add persistent small replay/group shards, short worker interruption/retry tests, 12 live Tactical Sectors, publication idempotency, capacity and Game Control Center monitoring only after sporting behavior passes.
5. Do not select V3 for official production races or resume game time without separate explicit authorization.

**Production guard** — authoritative game time remains Season 1 20 October 06:38, and both clock pause flags remain set. The saved 12x speed must not change to 2x until a separate, approved clock reconciliation and restart.

**Verdict: isolated physical lane movement and resumable checkpoints work; realistic peloton overtaking, cooperative drafting, power and mountain outcomes remain NO-GO.** Remote GitHub Actions completion, full website build and Netlify deployment have not been independently verified.
