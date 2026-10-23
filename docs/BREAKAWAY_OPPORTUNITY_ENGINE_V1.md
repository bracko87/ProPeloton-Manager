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

## First actual-roster scenario validation — 2026-10-23

The three whitelisted stages remain unprocessed and have **zero official results** and **zero locked stage plans** at snapshot time. Production database roster attributes were read without writing any data. Exact IDs and names were omitted from the numeric fixtures; each participant was represented by an anonymous rider and team token.

| Stage | Registered / teams | Currently not fully fit | Cooperative escape / chase 0.15 | Balanced chase 0.43 | Organized chase 0.85 | Uncooperative escape 0.40 |
| --- | --- | --- | --- | --- | --- | --- |
| Bačka Plains Opener | 96 / 16 | 60 | Escape survived +223.04 sec | Caught km 95.58 | Caught km 17.07 | Caught km 34.52 |
| Binche–Chimay–Binche | 120 / 20 | 119 | Escape survived +372.26 sec | Caught km 165.00 | Caught km 24.92 | Caught km 69.49 |
| Fruška Gora Finale | 96 / 16 | 60 | Escape survived +300.43 sec | Caught km 108.85 | Caught km 18.60 | Caught km 37.60 |

All scenarios use five consenting **synthetically selected** breakaway riders from distinct teams based on the snapshot's terrain skill, endurance and fatigue; the rest receive neutral instructions. Cooperation, peloton response, weather and tactics are **hypothetical**, not locked player stage plans. There is no forced breakaway win. In all three cases an input with no breakaway intent correctly produces `no_escape`.

A deterministic sensitivity sweep with strong cooperation and chase intensity from 0.1 to 0.9 in 0.1 increments returned `survived` at 0.1–0.4 and `caught` at 0.5–0.9 for the three current cohorts. **This is a test sensitivity matrix, not a 44% real-world win probability**, because equally spaced chase intensities are not actual frequency-weighted race conditions.

The test suite `breakawayOpportunityRealRoster.test.ts` includes 18 cases (three stages × five scenario configurations, plus one chase sweep per stage), 27 tests when combined with core breakaway physics tests; all passed in [GitHub Actions run 40004812242](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40004812242). The original 557 accepted race-engine tests and build also passed.

## Shadow integration boundary — first production release preparation

`runBreakawayShadowWithOfficialV1.ts` provides an in-memory comparison interface that:

- Calls the **accepted** official calculator once and retains its output verbatim;
- Runs the independent escape preview only when the exact stage UUID/terrain/road-race format matches the stage whitelist;
- Requires the caller to explicitly translate *actual locked* game-team tactics and physical rider inputs rather than silently fabricate them;
- Retains the accepted official result unchanged if the shadow throws, provides mismatched stage data or is ineligible.

Additional official-finish/replay identity tests exist in `runSelectedRaceEngineV1.test.ts`. The four production Supabase Edge Function race workers are **not connected to this wrapper and are not redeployed**. These tests prove in-memory orchestration invariants only.

**Release decision:** Only Bačka Plains Opener is the recommended **first candidate**. Do not switch its authoritative race engine yet: this model outputs a group-vs-peloton escape survival sketch, not official individual gaps, finish rank, incidents, replay frames, GC, classifications, stage points or prizes. Implementation of a complete separate authoritative stage solver, all checkpointed worker source pins, safe resume and sporting settlement remains necessary. The user must explicitly approve the first authoritative pilot only after those checks pass.


## 2026-10-23 complete 96-rider race-engine regression — release gate remains closed

After the full sporting fork `runBreakawayExperimentalEngineV1.ts` was introduced, the complete `breakawayFullPilotRealRoster.test.ts` test was executed in GitHub Actions against 96 anonymized Bačka registrants with **synthetic** stage orders and starting stamina. This is separate from the successful 30-checkpoint shadow opportunity model.

- [Run 40011508641](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40011508641) failed: two accepted successful second-wave attacks (R031 and R017) were shown in the peloton at their launch kilometres. Replay verification correctly rejected the physically impossible commentary.
- The specialist Phase-1 physical response was adjusted without changing the accepted universal engine, allowing the first B1 move to remain live when the second-wave riders successfully launched.
- [Run 40013477735](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40013477735) passed: physical group replay synchronized, no race writes, full sporting result for both 96-rider scenarios, 27 breakaway tests, 20 isolation tests and **557/557 legacy engine tests**.
- A subsequent chase-sensitive speed adjustment was tested in [run 40014063658](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40014063658), again with all checks green. **But no stage-long escape succeeded.**

Latest complete-solver results:
 
| Scenario | Successful opening attacks | Latest opening catch | Final classification | Breakaway winner? |
| --- | ---: | --- | --- | --- |
| Minimal organized chase, synthetic cooperative escape | Three, with separate wave launch kilometres | **20.168782 km** of 139.2 km | 96 riders, 1 final group, winner R028 | **No** |
| Organized peloton chase | Zero accepted opening escape riders | No B1 to catch | 96 riders, 1 final group, winner R019 | **No** |

**Blocking result:** The technical regression contract passes, but the specialist has not demonstrated its core requirement: plausible long-range survival, individual gaps and an occasional justified breakaway victory under genuinely permissive tactics. It must not be promoted merely because the stage ID is allowlisted. The experimental fork uses a complete sporting contract; however, the four live Supabase race workers are still pinned to accepted historical source commit `878aa8ae0db95d97fa5385513d2c1394e3a791a2` and do not use this new fork.

**Required next work before approval:** calibrate the specialist's actual full-stage chase and escape-pace interaction across Phase 1 through Phase 4, test *multiple deterministic seeds and different team orders*, confirm synchronized complete replay and valid winner/points/GC/payout contracts, and independently validate a coordinated worker-pin release with a clear fallback. Do not change official stage results or trigger a real race for calibration.

## 2026-10-23 Phase-1/Phase-2 physical recalibration — halfway gate passed; release closed

GitHub Actions [run 40019029799](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40019029799) passed the complete race-engine workflow after scoped experimental-only changes at commit `caf34a308b47978b5a4983827b47ac3f7b51e206`. The production build, replay synchronization, full Bačka roster simulation and **557/557 accepted-engine legacy tests** passed.

Measured 96-rider Bačka simulation checkpoints, synthetic team orders/readiness:

| Deterministic scenario | Successful opening escapees | Physical gap at 25% | Physical gap at 50% | Breakaway winner |
| --- | ---: | ---: | ---: | --- |
| Minimal pursuit / original seed | 3 | 0 seconds | 0 seconds | No |
| Minimal pursuit / seed A | 4 | 100.932151 seconds | **18.505104 seconds** | No |
| Minimal pursuit / seed B | 0 | 0 seconds | 0 seconds | No |
| Organized pursuit / original seed | 0 | 0 seconds | 0 seconds | No |
| Organized pursuit / seed A | 0 | 0 seconds | 0 seconds | No |
| Organized pursuit / seed B | 5 | 60.942402 seconds | 0 seconds | No |

The specialist now demonstrably supports at least one physically computed, cooperative escape still ahead at the halfway checkpoint, while the coordinated chase can catch a different escape. The threshold-based regression gate remains enabled.

Diagnosis: the specialist's pace model double-counted lost pull efficiency as energy fell, and a single control team with only 3–5 workers was allowed nearly full road tempo against an escape. The experimental-only changes compensate partially for ongoing group rotation in the absence of pursuit and moderate Phase-2 peloton speed when there is at most one weak control team and no chase orders. They never set a winner, invent a gap, bypass replay synchronization, or change accepted universal engine code.

**Remaining blockers:** Neither tested cooperative escape won the stage. Diagnose Phase-3/Phase-4 attack orders, energy/cooperation and actual group speed, then expand independent seeds, team orders and different terrain/stage scenarios. Require physically justified occasional late survival and complete winner/replay/GC/points/financial contracts before requesting an authoritative worker-pin pilot. All four production race workers remain unchanged; no live race write was performed.
