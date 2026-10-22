# Experimental mountain engine — explicit stage selection (pilot V1)

This pilot is **not a global terrain switch**. It must not automatically replace the normal universal race simulation simply because a stage is mountainous.

## Stage-ID allowance

The only approved pilot stage IDs in `src/universal-race-engine/mountainEnginePilotV1.ts` are:

- Xingtai Tour Stage 2: `62c7ca62-b6aa-470f-bf32-0822f64849c0` (already officially calculated; read-only baseline).
- Tour of Poyang Lakes Stage 7: `9c329adc-ccbf-45cf-8b5f-5b07604b341a`.
- Trofeo Tessile & Moda Valdengo–Oropa: `0885f370-5082-4bbe-994f-3938f00b7b11`.

The pilot requires both `road_race` and `mountain` terrain in addition to the exact stage ID.

For non-pilot mountain stages:
- The separate scenario-selection pass is skipped.
- The prospective `summitFinishSelectivityV1` flag stays disabled.
- The existing baseline universal race engine continues to run.

Other terrains retain their existing behavior. The experimental mountain engine now has its own source-level physical simulation implementation, `runMountainExperimentalEngineV1.ts`, forked byte-for-byte from the previously approved universal physical solver. The immutable accepted baseline stays in `runRaceEngine.ts`. The opt-in dispatcher `runSelectedRaceEngineV1.ts` runs the experimental fork only for listed mountain road stages and the baseline for everything else. Both still share explicitly reusable supporting modules, but future experimental core-physics changes can be made in the fork without modifying baseline core physics.

**Caution:** the new fork initially calculates exactly the same as the baseline; it is isolation infrastructure, not a calibrated new algorithm by itself. Pilot mechanics (such as summit selectivity) must be proven independently. Production workers still import their previously pinned engine SHA and do **not** use this dispatcher yet.

## Current production acceptance evidence

Xingtai Stage 2: 120 published results, 120 general-classification rows; saved primary source `16d240ccd8a2d4351f8abae014d6cedd10c1b24c`, correct `summitFinishSelectivityV1=false`. Finishing times: 61 riders at winner time, 21 distinct elapsed times overall, max +367 seconds. Replay `degraded` and `rawReplaySynchronized=false`: not full acceptance. Its official results must stay immutable.

Poyang Stage 1 previously ran on the older SHA `652816a5c04c5de342fd1c45c31ed4f2536775b9`; despite 132 official rows it is excluded from new-engine acceptance.

Poyang Stage 7 and Oropa remain live candidates. Do not manually recalculate or trigger them. For Oropa, require saved input `summitFinishSelectivityV1=true`, approved engine provenance, no primary-result fallback and consistent official stage/GC classification, rider-group times and replay.

## Release constraints

- **Do not merge or deploy this pilot unreviewed.** Repository policy requires a tested PR to `main` and user authorization to release.
- Supabase race workers import Git-pinned primary engine and input builder files. Merging this PR alone will **not** update their current pinned commit. Any later worker pin or deployment needs a separate coordinated controlled release of all four workers and post-deployment read-back.
- No SQL migration or database writes are required for this code-level allowlist. Never rewrite official results.
- Physical replay gaps are a separate issue; a `safeMode: true`, `replayQuality: degraded` race is not a complete acceptance pass.
- Before calling this a truly independent mountain engine, separate the mountain pilot's physics implementation from the shared core and test that ordinary races are unchanged.
