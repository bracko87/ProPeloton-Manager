# Race Engine V3 — Milestone A2: measuring start-row confinement

**26 October 2026 — OBSERVATION COMPLETE / SPORTING NO-GO.**

## Purpose and method

Measure the suspected long-lived starting-grid bias without changing the 2D solver. The source is `scripts/v3/audit-a2-row-confinement-v3.mjs`, committed as `947fb295`, and CI workflow `.github/workflows/v3-a2-row-confinement.yml`, committed as `a562ace0`.

- Run full stages with the frozen synthetic Dordrecht (106 riders) and Guangxi (168 riders) inputs, steering enabled, capacity 3, default rider priority and default blocked-two-tick overtaking.
- Observe all active riders every 12 movement ticks, until the first rider finishes. Continue to the end to prove full classifications.
- Record quartile retention, incremental rank changes, initial-order pair inversions, immediate same-track front wheel, sampled blocking and its relationship to the original front wheel. Export every rider's observations and milestone samples.
- Assert that the engine's original capacity-3 winner and final tail gap are unchanged. No physics, gameplay, clocks, SQL, historical results or production selector changes.

## Verified results

| Quantity | Dordrecht | Guangxi |
|---|---:|---:|
| Riders; full stage completed | 106 / 106 | 168 / 168 |
| Snapshots before first finisher | 99 | 146 |
| Rider observations | 10,494 | 24,528 |
| Starting-quartile retention | **70.916714%** | **49.270222%** |
| Snapshots where rider's rank changed | 73.661140% | 70.344097% |
| Mean absolute rank change / observation | 1.763865 | 1.883154 |
| Mean initial-order pair inversions during stage | 13.515750% | 19.431880% |
| Max observed initial-order pair inversions | 15.112309% | 22.932706% |
| Sampled rider observations with a blocking streak | **70.554603%** | **69.814090%** |
| Original front wheel among sampled blocked observations | **39.829822%** | **30.763840%** |
| Original front wheel among all observed front-wheel contacts | 6.128926% | 4.787083% |
| Maximum displacement from starting rank | 48 places | 102 places |
| Completed passing steering maneuvers | 573 | 905 |
| Aborted passing steering maneuvers | 264 | 279 |
| Blocked rider-ticks (entire stage) | 92,768 | 208,287 |
| Winning rider matches existing cap-3 control | r003 — **PASS** | r003 — **PASS** |
| Original tail gap matches existing cap-3 control | 1,193.300376s — **PASS** | 1,231.182305s — **PASS** |

**Evidence:** [A2 row-confinement GitHub Actions — both jobs SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40392578114). GitHub Actions artifacts `v3-a2-row-confinement-dordrecht-2000-10-15` and `v3-a2-row-confinement-guangxi-2000-10-19` retain the 106 / 168 individual rider rows and sample timeline, for 30 days.

The observational audit passed the micro collision and finish-line tests and the application build. It did **not** perform independent checkpoint recovery; previous A1/A2 full-stage suites supply that separate proof.

## Interpretation

**Riders move in the classification, but blockage is persistent.** Starting quartile retention is substantially higher in Dordrecht than Guangxi, while roughly 70% of sampled rider observations have nonzero blocking streaks in both simulations. A material fraction of those blocking observations involve the same front wheel each rider had at the synthetic starting grid. This is evidence worth diagnosing, **not proof that a single starting neighbor caused the final result**.

**Important limitation:** a changed ordinal rank is not necessarily a safely executed bicycle pass; pass reservations, drafting and blocked movement must be studied separately. A 12-tick sampling interval misses short exchanges and does not provide an exact count of wheel-to-wheel overtakes. Observations stop before the first finisher to avoid changing roster-size denominators. Road width is an unverified 5 m hypothesis, power/tactics are synthetic and authentic flat/hilly/mountain sporting benchmarks remain unavailable.

## Next narrow A2 engineering gate

1. Inspect the current solver's **global** cap of three active passing reservations; distinguish riders passing at physically distant locations from bikes sharing the same road corridor. A global limit may create artificial long-range coupling even if local collision rules are valid. Test a **research-only spatially bounded** admission policy, with local shared-space collision checks unchanged.
2. Compare the baseline, candidate and two or more independent initial-grid permutations. Report rank inversion share, winner stability, true longitudinal pass events, queue-wait duration, stalled acceleration and final gaps, **not only blocked rider-ticks**.
3. Require full-stage classifications, no collisions, valid finite W-prime, no baseline regression, reproducible checkpoint recovery, and source-realistic elevation/width before any sporting approval.
4. Resolve the known missing ascent (718m Guangxi and 1,065m World Nations), sub-tick finish energy and authentic groups/breakaways as separate A2 gates.

**Decision:** This observational gate is complete, but no solution has been approved. Milestone A1 remains technically passed; **A2 OPEN / SPORTING NO-GO; B/C NOT STARTED**. Official results, races, database, source selector and game clock unchanged.
