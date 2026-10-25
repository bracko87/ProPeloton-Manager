# V3 Calibration Batch 15 — Longitudinal formation and exact-time cluster diagnosis

**25 October 2026 — independent offline research only; sporting acceptance: NO-GO.**

## Root cause, reproduced
The alternative power solver initializes **all riders at exactly 0 metres** and assigns riders within the same physical group an identical collective pace until a rider's particular attack, recover or fatigue limit diverges. Long shared trajectories therefore cause exact position and exact physical finishing-time coincidences. The frozen real-source Dordrecht control has **98 of 106 riders on the same exact physical finish-gap value**, not merely on one official cycling timing group. A genuine bunch may share an **official recorded time**, but its riders should not all occupy one exact physical location at the finish.

## New gated research experiment

- Added `src/race-engine-v3/neutralStartFormationV3.ts`, a **pure deterministic hypothetical rolling-start formation** with 1–6 cyclists abreast and 1.5–4 metre longitudinal row spacing. Riders are assigned by seed+ID, independent of order in input arrays and individual performance attributes; there are no prescribed finishing gaps, overtaking outcomes or result classifications.
- Added an **optional** `experimentalStartFormation` argument to `src/race-engine-v3/experimentalPowerRaceV3.ts`. It is absent by default; without the option, the original benchmark remains bit-identical. The same input fingerprint, source-quality gate, checkpoint serialization, physical-group lineage and `sportingApproval: NOT_APPROVED` are preserved.
- Added `scripts/v3/verify-neutral-start-formation-v3.mjs` (synthetic deterministic formation, positional bounds, permutation, unchanged default, no official writes and resumed checkpoint equality).
- Added `scripts/v3/audit-neutral-start-grid-v3.mjs` (three reproducible 106-rider scenarios with **aggregate outputs only**). It uses explicit research-only substitute attributes unless a locally present private source supplement is supplied by environment variable. The private supplement is strictly validated; **no rider-level source data is uploaded to GitHub or included in the public bundle**.
- Extended dedicated V3 CI to run these scripts and strict typecheck of the formation module.

### Dordrecht: actual private source fields, 106 riders

| Offline physics experiment | Physical initial pack depth | Distinct exact physical finish-gap values | Largest exactly coincident cluster | Last-rider gap |
|---|---:|---:|---:|---:|
| Existing all-at-zero reference | 0 m | 9 | 98 riders | +263.295 s |
| **Hypothetical** 4-abreast, 2 m rows | 52 m | 35 | 4 riders | +208.014 s |
| **Hypothetical** 3-abreast, 2 m rows | 70 m | 42 | 3 riders | +188.696 s |

All three finish 106/106, record 15 attempted attacks, and have 1–2 riders finishing within one second of the winner. The unchanged reference exactly reproduces Batch 14. These changes do **not** demonstrate a realistic race; they prove that missing physical initial positions are a major cause of the exact-coordinate collision.

### Public substitute-attribute stress

Without the private source data, the public stand-ins yield a very different Dordrecht final tail: **+1667.439 s** with all-at-zero, versus **+1615.050 s** with the synthetic four-abreast grid. Those are not valid historical measurements. The CI audit explicitly labels them `EXPLICIT_SYNTHETIC_SOURCE_STANDIN` so they cannot be confused with the private-source evidence.

### Guangxi synthetic mountain stress

The same hypothetical four-abreast, 2 m grid reduces the largest exact-gap cluster to **4** and the within-one-second group to **7/168**, with an approximately **+189.046 s** tail. However, **this is NOT a validated mountain separation**: the outcome is extremely sensitive to unverified starting order/position, missing source equipment fields for 168 riders and **718 m of missing declared ascent**. The smaller cluster is an experimental input-geometry effect, not evidence of more selective mountain cycling.

## Validation and release protection

- **26/26 locally executed V3 research/regression/audit scripts passed** with a validated private supplement; both the default and optional runner complete with deterministic replay and serialized checkpoint resumption. Strict TypeScript type checking passed. The public audit also passed when executed without the private supplement.
- GitHub code read-back matched the local module and test exact Git blobs. The core's executable code was validated by normalized code comparison; the GitHub copy differs from the local test file in comments only. GitHub Actions was updated, but remote workflow status and full app build **have not** been independently verified.
- These changes do not modify Baseline, Mountain V2, Breakaway V1, official result publishing, workers, historic outputs, database state or the original V3 motion solver. The new option is **off unless explicitly enabled in offline research**.
- Starting-line geometry, lane movement, overtaking, aerodynamic positioning, rider work rotation, course bearings and detailed mountain gradient remain unverified. A seeded hypothetical grid is **not a replacement for real starting-order data** and cannot be used to force desired sporting classifications.

**Verdict:** physical-coincidence diagnostic and protected opt-in formation experiment complete; sporting approval remains NO-GO. Next priority: a physically grounded lane/wheel-following and drafting model that allows movement and overtaking, then real-source terrain and independent race-performance validation.

**Production guard:** both game clocks remain paused at authoritative Season 1, 20 October 06:38; stored speed still 12×. Do not restart or switch to 2× without a separate authorized, safe clock operation.
