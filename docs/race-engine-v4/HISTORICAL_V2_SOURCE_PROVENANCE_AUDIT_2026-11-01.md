# V4 historical V2 source provenance audit — 2026-11-01

Status: read-only, research only. No V4 realism approval and no changes to official races.

## Verified archive evidence

- 69 completed archived road races, 56 on 2026-10-24 and 13 on 2026-10-25 (UTC). Terrains: 17 flat, 40 hilly, 12 mountain.
- All 69 saved results report engine version 1 and key ppm_universal_race_v1, not an exact executable Git revision.
- Archived input/output MD5 fingerprints are present; they are data hashes, not source-commit hashes. No sourceCommit or gitSha keys were found in the inspected engine input and result summary objects, and the run table has no corresponding column.
- Recorded saved replay synchronization: 48 of 69. The other 21 must not be taken as strict synchronized replay evidence.

## Git commits overlapping archived production results (UTC)

| Git commit | Time, 2026-10-24 | Change |
|---|---|---|
| f404546f12 | 16:19:01 | Baseline tempo versus pursuit physics |
| 218d3d9fd6 | 17:56:03 | Mountain finishing physical gap calculation |
| a9ad36c6f9 | 22:05:53 | Baseline cruising and chasing |
| 8db593c61b | 22:38:50 | Opening gap and catch-first replay ordering |

| Archived completion relative to these commit times | Race count | Saved replay synchronized |
|---|---:|---:|
| Before Oct 24 16:19:01 UTC | 44 | 26 |
| During Oct 24 16:19:01–22:38:49 UTC | 8 | 6 |
| At/after Oct 24 22:38:50 UTC | 17 | 16 |

CRITICAL: Git commit times are NOT deployment times. Later race completion does not prove execution of any particular code revision. Do not infer exact source parity from timestamps alone.

## Later 17 archived races (not source-version verified)

| Terrain | Races | Saved synchronized and fully mapped to team-entry records |
|---|---:|---:|
| Flat | 5 | 1 |
| Hilly | 10 | 9 |
| Mountain | 2 | 2 |
| Total | 17 | 12 |

Four later flat archives have 85 or 86 team-array elements and no expected first race-team-entry identifier. The restricted exporter must NOT invent ownership or waive its 2–40-team bound for those records.

## Existing local historical run (Oct 30)

12 private snapshots exported, 1 full V2/V4 replay triple (mountain). Within the 12: 4 unsupported experimental V2 solver lanes, 4 unclassified runtime failures, 3 mismatched original V2 classifications, and 1 matched. The matched mountain breakaway maximum was about 57.94 seconds in all variants. One triple is not sufficient for any claim of improved realism.

## Next actions

1. Leave production V2 and all official records untouched; the temporary historical research login stays NOLOGIN.
2. Prefer the 9 later synchronized/mapped hilly snapshots for further diagnostic tests when a fresh read-only credential is explicitly authorized; they are *candidates*, not verified replays.
3. Use private fixed-category worker error diagnostics to distinguish engine runtime exceptions from historical classification drift.
4. Reconstruct calculation-time source provenance from actual deployment evidence where possible. Archive engine version and timestamps alone are insufficient.
5. Keep experimental mountain/breakaway solver lanes separate. Do not silently calculate them using ordinary baseline physics.
6. Require multiple parity-verifiable, strictly synchronized, reproducible races before assessing V4 realism or production adoption.

All findings are aggregate and contain no raw archived race snapshots, rider identities, passwords, or private file paths.