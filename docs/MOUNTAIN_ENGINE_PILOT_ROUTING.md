# Experimental mountain engine — explicit stage selection (pilot V1)

This pilot is **not a global terrain switch**. It must not automatically replace the normal universal race simulation simply because a stage is mountainous.

## Stage-ID allowance

The only approved pilot stage IDs in `src/universal-race-engine/mountainEnginePilotV1.ts` are:

- Xingtai Tour Stage 2: `62c7ca62-b6aa-470f-bf32-0822f64849c0` (already officially calculated; read-only baseline).
- Tour of Poyang Lakes Stage 7: `9c329adc-ccbf-45cf-8b5f-5b07604b341a`.
- Trofeo Tessile & Moda Valdengo–Oropa: `0885f370-5082-4bbe-994f-3938f00b7b11`.

The pilot requires both `road_race` and `mountain` terrain in addition to the exact stage ID.

For non-pilot mountain stages:
- The **existing** baseline solver and pre-calculation/scenario-selection pathway remain in place; no existing scenario handling is skipped.
- The existing `summitFinishSelectivityV1` input setting is preserved exactly as in the previously deployed baseline. It must not be disabled for non-pilot races: that would silently alter accepted summit results. The NEW experimental solver itself is selected only for allowlisted stages.
- The dedicated mountain solver is never selected.

Other terrains retain their existing behavior. The experimental mountain engine now has its own source-level physical simulation implementation, `runMountainExperimentalEngineV1.ts`, forked byte-for-byte from the previously approved universal physical solver. The immutable accepted baseline stays in `runRaceEngine.ts`. The opt-in dispatcher `runSelectedRaceEngineV1.ts` runs the experimental fork only for listed mountain road stages and the baseline for everything else. Both still share explicitly reusable supporting modules, but future experimental core-physics changes can be made in the fork without modifying baseline core physics.

**Caution:** original production input normalization, including the pre-existing summit selectivity flag, is byte-for-byte preserved. The fork mostly retains the baseline sporting algorithm; it is independent source and stage-routing infrastructure, not yet proof of fully calibrated mountain physics. Its first experimental-only fix changes replay B1 lineage retention to use the true physical catch threshold rather than the 5-second official grouping tolerance. Other sporting-result logic remains unchanged. Production workers still import their previously pinned engine SHA and do **not** use this dispatcher yet.

## Current production acceptance evidence

Xingtai Stage 2: 120 published results, 120 general-classification rows; saved primary source `16d240ccd8a2d4351f8abae014d6cedd10c1b24c`, correct `summitFinishSelectivityV1=false`. Finishing times: 61 riders at winner time, 21 distinct elapsed times overall, max +367 seconds. Replay `degraded` and `rawReplaySynchronized=false`: not full acceptance. Its official results must stay immutable.

Poyang Stage 1 previously ran on the older SHA `652816a5c04c5de342fd1c45c31ed4f2536775b9`; despite 132 official rows it is excluded from new-engine acceptance.

Poyang Stage 7 and Oropa remain live candidates. Do not manually recalculate or trigger them. For Oropa, require saved input `summitFinishSelectivityV1=true`, approved engine provenance, no primary-result fallback and consistent official stage/GC classification, rider-group times and replay.

## Release constraints

- **Do not merge or deploy this pilot unreviewed.** Repository policy requires a tested PR to `main` and user authorization to release.
- Supabase race workers import Git-pinned primary engine and input builder files. Merging this PR alone will **not** update their current pinned commit. Any later worker pin or deployment needs a separate coordinated controlled release of all four workers and post-deployment read-back.
- No SQL migration or database writes are required for this code-level allowlist. Never rewrite official results.
- Physical replay gaps are a separate issue; a `safeMode: true`, `replayQuality: degraded` race is not a complete acceptance pass.
- Xingtai's authoritative Phase 2 physical trajectory remains active until km 46.1, but the earlier replay constructor dropped B1 whenever the Phase 1 boundary gap was below 5 seconds. Its 3.690225-second boundary gap was **above** the true 0.75-second physical catch threshold, so the replay incorrectly removed B1. The experimental fork uses the physical threshold; the existing core remains intact.
- A previous prototype that inferred catches from replay group disappearance was intentionally removed: it could have reported a catch too early without matching the authoritative 46.1 km event. No synthetic commentary is used as a substitute for physical-state evidence.
- Full implementation requires production worker orchestration to select the experimental stage-scoped solver for both ordinary and checkpointed safe-mode runs, with source SHA pinning and post-deployment read-back. The code-level dispatcher alone is not a production release.
