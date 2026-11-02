# V4 research — 220 km mountain winner-finish gap collision forensic
Date: 2026-11-02. Status: RESEARCH ONLY — NOT A PHYSICS FIX OR REALISM APPROVAL.

## Reproduction and integrity

Read-only synthetic 220 km mountain stages with 8 deterministic seeds and 0, 1, 3 or 5 explicitly chasing riders, held within a matched terrain/course/AI input fixture. Preserved V2 and isolated calibrated V4 use hash-identical snapshots for each treatment; the automatic/explicit chase workforce code, final classifications, production V2 and the original strict replay validator remain untouched. Zero production writes.

The full 2×2×4 suite first isolated the failing checkpoint to `winner-finish`. A fixed, allowlisted issue-code classifier identified the exact first blocking issue: `duplicate_physical_group_gap`. No rider identities, file paths or source snapshots are emitted by diagnostics.

A separate, fast 220 km mountain CI lane keeps the **same stage IDs** as the full matrix. An earlier fast-lane variant generated different stage IDs and produced different deterministic results; that variant is **not** used as the basis for these findings. The corrected lane is verified in [run 41424993530](https://github.com/bracko87/ProPeloton-Manager/actions/runs/41424993530).

## Actual 220 km mountain findings

| Explicit chasing riders | Strict V2 failures / 8 | Strict V4 failures / 8 | V2/V4 strictly paired valid | V4 equal-gap pairs |
|---|---:|---:|---:|---|
| 0 | 6 | 6 | 2 | Chasing–chasing (C–C) |
| 1 | 7 | 7 | 1 | Chasing–chasing (C–C) |
| 3 | 7 | 7 | 1 | Chasing–chasing (C–C) |
| 5 | 6 | 5 | 2 | Chasing–chasing (C–C) |

Every V4 `duplicate_physical_group_gap` rejection at the winner-finish checkpoint had an equal-gap C–C pair. The strict original validator rejects equal rounded physical gaps across separate group records when no explicit physical contact/merge event is published; it was **not** changed.

The strictly safe diagnostic also compared the collided C-group display codes with the nearest pre-finish checkpoint:

| Chase workforce | Missing prior matching group code | Prior codes both present with different gaps | Prior codes present with equal gaps |
|---|---:|---:|---:|
| 0 | 5 cases | 1 case | 0 cases |
| 1 | 6 cases | 1 case | 0 cases |
| 3 | 7 cases | 0 cases | 0 cases |
| 5 | 5 cases | 0 cases | 0 cases |

Caveat: a missing prior display code may result from renumbering or a newly formed physical chase group. The code-based comparison alone cannot establish that the riders were physically separated, and it does not identify a valid merge. The two previously separated-group cases likewise require checking distance/time and physical lineage at the final boundary. The new in-memory forensic instrumentation attaches only fixed C–C/other categories and origin categories to the V4 exception; it still throws on strict replay failure. Original V2 is uninstrumented.

## Distinct 120 km issue

At 120 km mountain, three of eight V2 baseline seeds fail `bridge_progress_invalid` across the chase treatments, whereas V4 passes those seeds. This is a separate bridge-lineage progression issue and must not be combined with the 220 km equal-gap collision.

## Workforce calibration (flat stages)

The separate, strictly matched 220 km flat pilot showed median team-level chase-worker counts of 1.5, 3, 3 and 5 for 0, 1, 3 and 5 explicit chase orders, respectively. Median pursuit strength scores were approximately 69.95, 72.18, 71.94 and 77.48. The first explicitly commanded rider activates organized chase; additional commanded riders may replace automatic workers. The solver does count individual riders, but the team-activation effect dominates several tested outcomes. Do **not** change pursuit coefficients based on survivor count alone.

## Engineering decision and next test

**No forced physical merge, arbitrary fractional gap offset, replay-validator relaxation or production deployment.** Future work should map C-group rider membership across the last pre-finish checkpoint, any explicit contact/split/merge events and the winner-finish/final-results groups using physical lineage rather than display code alone. Establish whether groups really converge or merely acquire duplicate rounded official gaps. Only then implement an isolated V4 source correction with tests confirming valid measured road transitions. Re-run the 120/170/220 km hilly suite, the 3×3 strength/motivation matrix, flat/mountain workforce suite and both Linux/Windows/React gates.

Code:
- `scripts/v4/terrainDistanceWorkforceV4.test.mjs` — full sweep or `V4_MOUNTAIN_WINNER_FORENSIC=1` fast lane, all strict failures preserved
- `src/race-engine-v4/privateHistoricalDiagnosticsV4.mjs` — first-replay-invariant safe allowlist
- `.github/workflows/v4-mountain-finish-forensic.yml` — focused reproducible CI test
