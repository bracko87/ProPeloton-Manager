# ProPeloton — Breakaway Opportunity Engine V1 (third isolated engine)

## Purpose

The 19–28 September 2000 game-time audit found 51 completed stages, including 50 road races; **no confirmed opening-breakaway victory**. In 36 stages with a reported opening escape, 30 had the opening move caught within the first 15% of the race. Three later escapes survived until 12–17 km remained but were caught before the finish.

Rather than globally rewriting the universal physics or changing Mountain V1/V2, the game now has an **independent and deterministic experimental breakaway model**, `src/universal-race-engine/breakawayOpportunityEngineV1.ts`. It accepts real race candidates' strength and tactics as inputs, simulates an independently timed escape vs. peloton pursuit over 30 progress segments, and emits checkpoints and an experimental escape-survival outcome. **It does not calculate official standings.**

## Stage eligibility (exact UUIDs, opt-in only)

| Game date | Stage | Terrain | Current mode |
| --- | --- | --- | --- |
| 2000-10-06 | Trka kroz Vojvodinu — Bačka Plains Opener (`5523cf76-8fd4-4a12-ab28-7f285c9829ff`) | Flat | Shadow only |
| 2000-10-07 | Binche–Chimay–Binche (`335708f7-d56a-4816-9068-38399e8f74e3`) | Hilly | Shadow only |
| 2000-10-08 | Trka kroz Vojvodinu — Danube and Fruška Gora Finale (`f5af8665-91c1-4585-937e-11fb94f65819`) | Hilly | Shadow only |

Eligibility additionally requires an exact matching `road_race` stage format, terrain and finite positive race distance. Other stages, even in the same race, are excluded. Mountain stages, ITT/TTT races, youth races and previously completed stages must not be promoted.

The `escapeOpportunity` is a modest, published stage-specific physical speed influence, **not** a fixed win percentage or forced winner. The engine needs actual interested breakaway riders and accepts the peloton's chase commitment, fatigue, ability, terrain and cooperation. It can produce `no_escape`, `caught` or `survived` for exactly the same route as those inputs change. The output `provisionalEscapeWinnerId` is for experimental comparison only and is **not an official winner or full ranking**.

## Isolation and acceptance requirements

1. Normal race calculation and both mountain engines are **unchanged**. The new engine is not imported by `runSelectedRaceEngineV1.ts`, any official Supabase race worker or any production dispatch path.
2. Its API `runSelectedBreakawayPreviewV1(input)` returns non-authoritative read-only telemetry. No SQL writes, completed-result mutations, rewards, replays, points, GC changes or schedule modifications.
3. Shadow test a **range** of actual stage inputs, including highly cooperative and ineffective breakaways, hard and soft chase, late catch, bad weather/fitness and teams with no attack orders. Confirm replay checkpoint clocks/gaps are coherent.
4. Do not hardcode a target number of breakaway victories, preselect winner IDs, or silently select all flat/hilly races; occasional survival must follow the physics.
5. Before promoting a **single** eligible stage to official results, implement a separate integrated stage-level solver fork that preserves the full official phases, incidents, rankings, replay, group timing, GC, points, prizes and worker safe-resume/pin contracts. Add fallback and validation. Require explicit user approval for official activation; stage whitelist inclusion is not approval.
6. Keep the stage-selection lanes mutually exclusive: baseline, special breakaway or mountain; never run two authoritative engines on one stage.

## Current release status

**A coded, independently tested shadow prototype is present on `main`; no new official stage engine has been activated.** The ordinary race engine remains authoritative for all stages. Review the isolated test reports and full legacy engine suite before any future stage-specific controlled release.
