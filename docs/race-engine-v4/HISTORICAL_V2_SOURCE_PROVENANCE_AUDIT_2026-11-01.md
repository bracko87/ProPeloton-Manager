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

## 2026-11-01 metadata-first candidate triage

In the latest 18 archives per terrain, read-only SQL found the following **preflight candidates** with a synchronized saved replay, 2–40 teams and a present first entry identifier: flat 8/17, hilly 14/18, mountain 9/12. Preflight does **not** attest complete authoritative team mapping, active solver lane, current V2 parity or exact source commit.

The restricted PostgreSQL history query now returns only additional metadata **flags/counts**, not input snapshots: saved replay synchronization, team count and first-entry identifier validity. Research selection excludes explicit unsynchronized or impossible team/entry records, prioritizes candidates passing all three flags, and retains an unknown-metadata fallback for legacy client compatibility. Export still enforces every original full team-entry ownership mapping, and physics still enforces replay synchronization and classification parity.

This optimization changes the **order of attempted historical research comparisons**, not physics or production data. It does not approve V4 realism.


## Hilly-focused private replay option — 2026-11-01

The isolated PostgreSQL reader now accepts `PPM_V4_RESEARCH_COHORT=hilly_latest_nine`, selecting up to 9 hilly races only with a bounded pool of 24 candidates. The default balanced cohort is unchanged. This option cannot run official production races or alter results. The 9 later-start hilly records are synchronized and fully team-mapped, but exact source revision and historical V2 replay parity are still unknown. A new private research password is required before any future local database connection; the prior exposed password must not be reused.


## Nine-hilly full archive preflight, 2026-11-01

A read-only aggregate audit verified all nine late-start, synchronized, fully mapped hilly race archives against the strict private exporter contract. All **9/9** passed: distinct team and authoritative entry IDs; original club identity; AI ownership marker agreement; one locked stage plan per team, matching exact team membership; saved finish classification and original in-game start. The broader ten-race late-start cohort has 101–171 riders. The nine most recent synchronized and fully mapped hilly archives are exactly these nine late-start races.

A synthetic PostgreSQL runner test exercises nine unique private hilly snapshots and rejects one newer unsynchronized candidate, with zero database writes. This is **not** a completed real V2/V4 physics comparison, nor proof of historical source-commit parity or V4 realism. The temporary research login remains disabled pending new private credentials.


## Physical gap trajectory audit (2026-11-01)

Read-only aggregate queries over the nine late-start, synchronized, fully-mapped hilly archived races found a historical measurement discrepancy:

- Recorded `calibrationSummary.maximumBreakawayGapSeconds`: median **11.78 s**, minimum **7.045696 s**, maximum **225.044679 s**; zero of the nine were exactly 7.000000 s.
- Reading the internal primary-front physical gap trajectories and phase boundary samples: median physical peak **12.96 s** and mean **64.73 s** versus mean published maximum **62.91 s**.
- **5/9** race summaries omit an interior physical peak larger than the published maximum by more than 0.01 s (Phase 1: 2, Phase 2: 2, Phase 3: 1; those per-phase counts can overlap). Largest discrepancy **10.25 seconds**.
- Opening breakaway group recorded in **9/9** races; `breakawaySurvived=true` in **0/9** and `breakawayCaught=true` in **3/9**. The six remaining outcomes were *reduced_group_finish*, not missing race results. Source code defines the catch flag using Phase 2 `breakaway_caught` or Phase 4 `breakawayCaught`, and survival from the Phase 4 survival flag. Hence `caught=false` plus `survived=false` is not intrinsically contradictory.
- Four races had reported maximum gaps below 10 seconds; two had 10–30 seconds; none 30–60 seconds; one 60–120 seconds; and two exceeded 120 seconds.

The official V2 calibration summary explicitly samples `phase1.initialGapSeconds`, Phase 2 start/end, Phase 4 start/end and late chase steps, rather than all physical trajectory interior points and Phase 3 trajectories. A V4 **research-only** audit now tracks both the immutable published maximum and the maximum *observed primary physical front gap* across trajectory points and phase boundaries, with fixed numerical discrepancies. It does not rewrite results, reinterpret secondary front lanes as the main breakaway, or change either engine's physics.

Nine archived races are insufficient to approve V4 realism. The saved results remain the original production record and the new research metrics remain diagnostic only.


## Opening-breakaway distance research (2026-11-01)

The isolated V4 research worker now measures the **original opening breakaway** rather than treating every later front group as its continuation. It uses accepted opening attack kilometres, official exact catch kilometres in Phases 1–3, verified rider membership across phase boundaries, and Phase-4 chase step interpolation for an **estimated** catch kilometre. Any untraceable group is explicitly unknown, never assumed caught immediately. The report contains the number of kilometres ahead until a documented catch (or confirmed finish), plus conservative sampled kilometres where both adjacent recorded gap measurements were at least 60 or 120 seconds, without interpolating over unmeasured stretches above five kilometres. This adds diagnostics only, never changes V2 physics or publishes rider or team data. The nine hilly synthetic A/B comparison prints these distance metrics by scenario. Real historical V2/V4 parity remains unverified.
