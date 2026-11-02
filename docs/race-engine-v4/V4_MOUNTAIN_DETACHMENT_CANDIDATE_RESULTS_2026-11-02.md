# V4 optional same-source chase-group detachment candidate — 2026-11-02

Status: isolated research candidate, **not promoted to default V4** or production V2. No official race writes; unchanged strict replay validator.

## Evidence and method

The isolated 220 km mountain forensic identified `duplicate_physical_group_gap` at `winner-finish`. For the 25 V4 failures across four pursuit workforce conditions, each duplicated pair belonged to two C groups with a 1–10-second gap from the leader. Rider membership tracing found 23 pairs descended from the **same** immediately preceding chase group, and two were in separate preceding groups. In every failed case, the final authoritative group snapshot put the riders into one group; this is an official final membership observation, **not independently sufficient proof of a physical merge**.

The tested candidate `coalesceV4CoincidentDetachmentGroups(sourceGroups,selectedGroups)` consolidates selected C detachment groups **only when** their source-group membership is identical, their physical gaps are equal within 0.000001 seconds, both are behind the peloton, their group codes match, and neither carries a separate tagged physical lineage. It never creates a fractional distance or changes rider energy. The candidate is injected into an isolated compiled research executable only when `V4_MOUNTAIN_WINNER_COALESCE_CANDIDATE=1`, and original replay validation still blocks any unproven transfers.

## Result: 220 km mountain

8 deterministic seeds × 4 explicit-pursuit workforce settings. Each treatment has paired preserved-V2 reference and V4 runs using hash-identical inputs.

| Explicit chasing riders | Baseline V4 replay failures | Candidate V4 replay failures | Strict V2 baseline failures |
|---|---:|---:|---:|
| 0 | 6 / 8 | 0 / 8 | 6 / 8 |
| 1 | 7 / 8 | 1 / 8 | 7 / 8 |
| 3 | 7 / 8 | 1 / 8 | 7 / 8 |
| 5 | 5 / 8 | 0 / 8 | 6 / 8 |
| **Total** | **25 / 32** | **2 / 32** | **26 / 32** |

All 25 `duplicate_physical_group_gap` failures disappeared. The two remaining candidate rejections occurred at `winner-finish` and both are `post_catch_group_transfer_without_physical_transition` with a **C-to-C group membership change**. These remain correctly blocked. Do not disguise them as a simple C-label renumbering; a physical merge event must be evidenced and published or membership preserved.

V2's rejected runs are *not* retroactively eligible for matched historical comparisons even when the V4 candidate passes.

## Independent terrain controls

A separate opt-in **128-configuration** flat/mountain sweep on the same seed and workforce grid completed successfully (GitHub Actions run [41428382614](https://github.com/bracko87/ProPeloton-Manager/actions/runs/41428382614)):

- Flat 120 and 220 km: 64/64 V4 strictly valid, with the previous opening-breakaway survival counts unchanged.
- Mountain 120 km: 32/32 V4 strictly valid.
- Mountain 220 km: 30/32 V4 strictly valid, with only the two documented C-to-C post-catch failures.
- No unexpected runtime errors; no new leniency in the replay validator.

The research script now includes an additional opt-in **hilly** 120/220 km coverage lane as a next regression gate. That expanded outcome should be verified separately before default V4 activation.

## Next actions

1. Inspect the two C-to-C post-catch cases for a real measured contact event and location; add an explicit physical transition only if justified.
2. Complete the opt-in hilly coverage and full Linux/Windows/React regression checks.
3. Hold default V4 and production V2 unchanged until a broader historical source-provenance comparison validates race realism.

Code: `src/race-engine-v4/mountainWinnerDetachmentCandidateV4.mjs`, `src/race-engine-v4/mountainWinnerDetachmentCandidateV4.test.mjs`, `scripts/v4/terrainDistanceWorkforceV4.test.mjs`, `.github/workflows/v4-mountain-finish-forensic.yml`.
