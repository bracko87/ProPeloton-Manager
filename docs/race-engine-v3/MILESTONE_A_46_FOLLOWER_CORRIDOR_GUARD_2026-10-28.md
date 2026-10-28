# Race Engine V3 — Milestone A Step 46: moving-leader follower-corridor guard

**28 October 2026 — offline technical PASS, hard fallback improvement PASS, per-fixture sporting NO-GO.**

## Why this experiment

A45 traced **148** cases at 0.5-second physics resolution where A44's rear-priority solver exhausted all 64 allowed rounds of halving a trailing rider's proposed movement, leaving a swept collision pair even after the follower's movement scale was effectively zero. The previous solver conservatively restarted using synchronized all-pair halving and produced collision-free paths, but repeatedly entering this fallback is not a credible approach for real peloton simulation.

A46 tests a narrowly scoped physical hypothesis: **if stopping a follower does not avoid a moving leader's swept path, slowing only that follower cannot solve the conflict**. Priority must instead also modify the moving leader's competing path. This is NOT yet a proven right-of-way or race realism model.

## Scoped implementation

The separate optional policy `rear_corridor_guard` in `scripts/v3/a2CollisionPriorityResearchV3.mjs` is called only when the A34 research adapter explicitly receives `conflictPolicy:'trapezoid_rear_corridor_guard'`.

For each detected swept pair conflict with an unambiguous longitudinal leader, it tests whether the follower's **zero-progress stationary segment** intersects the current leader's proposed segment. If yes, it reduces both riders' currently proposed movement together. It also applies the two-sided reduction when the follower has already reached a very small (<1/65536) movement scale. Otherwise, the original rear-priority yielding continues. The solver keeps the same 64-round bound, original conservative all-pair fallback, unchanged underlying swept collision predicate, accepted-path energy accounting and JSON checkpoint recovery. Its policies are not enabled for real races; A34's `symmetric_halving` remains the default.

The new `priorityCorridorGuards` and `priorityStalledGuards` counters show how often the guard intervened without conflating those interventions with accepted crashes. At the 0.5s reference, **2,196** guard actions were recorded, of which **152** involved near-zero follower scale. These are resolution actions inside synthetic physical substeps, not rider crashes.

## Test evidence

[Step 46 GitHub Actions evidence](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40654723970) records individual fixture metrics, original baseline results and guarded results in the `a2-step46-corridor-results` CI artifact.

The test compares **40** starting fixtures (4 provisional road envelopes × 5 fields of 2, 8, 12, 24, 32 cyclists × 2 controlled demand variations) across five genuine physical time quanta **0.5s, 1s, 2s, 2.5s and 5s** and four policies: original symmetric A34, A43 trapezoid, A44 rear priority and A46 follower guard. This gives **800** identical-demand 60-second synthetic physical runs, plus **64** logical-ID renamings and **80** left/right road mirrors (two candidate policies), for **944 technical runs**. A separate controlled two-rider fixture directly activates the stationary-follower corridor guard.

All completed accepted paths passed independent piecewise swept collision clearance, finite nonnegative W-prime and energy ledger agreement, unchanged commands, exact serialized midpoint replay, and no official writes. The candidate was **identity-invariant in 32/32 tests** and **mirror-invariant in 40/40 tests**. No full peloton, real source stage, or calibrated road width is represented by this evidence.

## Verified result: all previous full fallbacks eliminated

| Actual physical quantum | A44 rear priority full conservative fallbacks | A46 guarded rear priority |
|---|---:|---:|
| 0.5s | **148** | **0** |
| 1s | 30 | **0** |
| 2s | 10 | **0** |
| 2.5s | 12 | **0** |
| 5s | 0 | **0** |

The fallback repair passed as intended without accepting collisions. **This does not mean all collision resolutions are sporting-realistic**; it proves only that the candidate did not need the previous emergency fallback for these particular 40 synthetic configurations.

## Numerical stability: improvement, but with regressions

Every policy is compared against **its own** 0.5-second reference, which is a computational comparator rather than physical truth.

| Physical step | A44 max x difference | A46 max x difference | A44 pair inversions | A46 pair inversions |
|---|---:|---:|---:|---:|
| 1s | 103.666590m | **102.189434m** | 347 | **256** |
| 2s | 143.535091m | **112.428288m** | **429** | 446 |
| 2.5s | 166.014490m | 166.014490m | 511 | **500** |
| 5s | 136.865462m | 136.865462m | 608 | **592** |

The 2-second rider-order regression means **A46 does not universally improve the A44 numeric aggregate** even though the geometric maximum is smaller. It is also necessary to examine individual fixtures rather than only summed pair inversions:

| Physical step | Individual fixtures evaluated | Regressions vs A44 on x, gap, or order | Regressions vs A43 trapezoid |
|---|---:|---:|---:|
| 1s | 40 | **2** | 2 |
| 2s | 40 | **3** | 6 |
| 2.5s | 40 | **3** | 6 |
| 5s | 40 | **2** | 6 |
| **Total** | **160** | **10** | **20** |

The ten regressions include changes in gap-to-front and positional pair ordering; they are not evidence of actual historical classification changes.

## Decision and A47

**Step 46 engineering test PASS, swept collision safety PASS, elimination of the 148 persistent half-second fallbacks PASS, ID and mirror fairness PASS. Sport-realistic race simulation NOT APPROVED.** The previously established requirement of zero scenario-level regressions is not met, and this trial still cannot simulate full 106/168 rider events because the underlying research adapter enforces a 32-rider maximum.

A47 should isolate the individual scenario counterexamples and evaluate whether changes to follower corridor treatment can reduce the ten remaining fixture-level regressions without recreating fallback storms or systematic rider advantage. It must eventually include faithful sourced road widths/elevation, drafting, realistic gaps and race stages with complete rider fields. Do not merge an opt-in research policy into live racing or use synthetic success to certify payouts, GC results, or game-clock stability.

**A2 sporting NO-GO. Milestones B/C NOT STARTED. No live race, player data, Supabase table or game-clock changes.**
