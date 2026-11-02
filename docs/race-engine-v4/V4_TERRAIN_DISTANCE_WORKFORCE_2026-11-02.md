# V4 Step 3: terrain × race distance × human chase workforce — 2026-11-02

## What was tested

A synthetic 2 × 2 × 4 pilot, **eight deterministic seeds per cell**: flat and mountain terrain, 120 km and 220 km, with 0/1/3/5 **explicit human chasing riders** assigned in Phase 2, Phase 3 and Phase 4. Each cell contains eight original V2 and eight isolated calibrated-V4 reruns, totalling 128 snapshots and 256 solver executions. Team counts ranged from 18 to 22. The same race, weather, rider attributes, team identities and AI template-first plans were reused across chase-workforce treatments within each course/seed. Preserved V2 and isolated V4 received hash-identical input snapshots. Source and replay validators were not modified.

The chase workforce selection was ordered by plan roster indices `[2,3,5,0,1]`. **Caution:** Five workers include the team's GC leader and sprinter, whereas one or three comprise helpers. This tests a deliberately increasing workforce, not the same-average-quality replacement or an exhaustive simulation of separate chasing teams.

## Flat stages

All **eight of eight** original-V2/calibrated-V4 pairs were strictly valid in every flat treatment. The opening-breakaway cohort for each chase setting was five matched accepted openings at 120 km, and four at 220 km.

| Flat course | 0 chasers | 1 chaser | 3 chasers | 5 chasers |
|---|---:|---:|---:|---:|
| 120 km: opening breakaways surviving | 5/5 | 5/5 | 5/5 | 5/5 |
| 220 km: opening breakaways surviving | 4/4 | 0/4 | 0/4 | 0/4 |
| 120 km: median maximum physical gap, seconds | 493.9479 | 379.6788 | 379.6788 | 377.8905 |
| 220 km: median maximum physical gap, seconds | 673.7665 | 653.4363 | 653.4363 | 651.4891 |

Strictly paired zero-to-five workforce peak-gap reduction (matched opening seeds) was **111.5868 seconds** at 120 km (five seeds) and **66.7927 seconds** at 220 km (four seeds). The median distance ahead decreased by **0 km** at 120 km and **25.143 km** at 220 km; four fewer breakaways survived the latter.

**Interpretation:** chasing materially reduces the physical peak, but changing from zero to one assigned rider has a much larger effect than increasing the workforce from one to three or five, and the 220-km finish outcome changes sharply from 4/4 to 0/4. This is a potentially over-binary behavior requiring more calibration and stronger checks of one-person pursuit effectiveness. At 120 km, all five matched opening breaks survive regardless of chase, and the current test does not establish that as realistic.

## Mountain stages

These are **not sufficiently sampled to calibrate**. Strict replay checks were preserved and their failures retained.

| Mountain course | Valid V2+V4 pairs per chase cell | Accepted opening cohort per cell | Outcome |
|---|---:|---:|---|
| 120 km | 5/8 | 1 | One opening break survives in all four workforce settings; sample too small |
| 220 km | 1–2/8 | 1–2 | No surviving openings in valid comparisons; sample too small |

At 120 km, V2 failed strict replay on three of eight seeds per chase treatment, while calibrated V4 passed all eight. At 220 km, V2 excluded **6–7** and V4 excluded **5–7** of eight seeds depending on workforce. Because the valid cases can differ by condition, any median or survival-rate comparison based on these tiny cohorts is **exploratory only**, and cannot establish realistic pursuit behavior or serve as a production release gate.

## Code-level interpretation of the chase response

The original universal engine's Phase-4 path explicitly collects individual chasing riders **and** team IDs. The per-team chase strength contains (1) a **fixed +6 bonus** when any explicit chaser is present, and (2) a **bounded rider-count contribution** of `Math.min(10, workerIds.length * 2)`, alongside rider average chase skill and remaining energy. The physical response call also receives both the number of active chasing teams and effective chasing riders. Therefore it is *not* accurate to say the engine ignores individual riders. The evidence suggests the initial **team chase activation** has a strong threshold effect and additional riders have less marginal impact in these scenarios. This conclusion applies to the tested synthetic inputs; it is not proof that every chasing situation behaves the same.

The test output additionally records `explicitChasingTeams` from Phase 4. It is zero without orders and one for all positive workforce sizes because only one human team was selected; this **team count is not rider workforce count**.

## Actions and limitations

1. Investigate mountain strict replay failures first using fixed, privacy-safe replay reason and checkpoint categories; do not loosen or bypass validation.
2. Extend the flat pilot to diverse seeds and compare **chasing team count** independently of **chasing rider count**. Separate fixed chase activation from incremental workforce contribution and test worker energy/speed affordability.
3. Add explicit independent scenarios for stronger versus weaker individual chasers with equal workforce sizes, and verify the results in other course profiles.
4. Compare only against historical archives with exact V2 source provenance and synchronized saved replay data before making realism or production claims.

This research did not write official results, alter production V2 or grant realism approval. Verified through GitHub Actions [V4 physical read-only proof run 41414224203](https://github.com/bracko87/ProPeloton-Manager/actions/runs/41414224203). The test file `scripts/v4/terrainDistanceWorkforceV4.test.mjs` emits `V4_TERRAIN_DISTANCE_WORKFORCE_PILOT` with strict sample counts and fixed-category rejection diagnostics.
