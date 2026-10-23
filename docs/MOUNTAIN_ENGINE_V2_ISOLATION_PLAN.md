# Mountain Engine V2 — isolated development and release gates

## NON-NEGOTIABLE PRODUCTION SAFETY
1. **Do not edit** `src/universal-race-engine/runRaceEngine.ts` while developing experimental mountain physics. Baseline Git blob at start of this project: `fa4ffd631d9d318ca92d6cfb8a517489b7842fcf`.
   Also freeze its directly imported shared helpers: `roadScenarioPhysicalDirectorV1.ts`, `replayPhysicalStateV16.ts` and `summitFinishSelectivityV1.ts`. Changes to a shared helper would silently affect the baseline even if its entrypoint stays identical. A source-fingerprint CI gate protects all four files.
2. Implement mountain-only physical group and climb calculations in `runMountainExperimentalEngineV1.ts` and purpose-built isolated modules. Never attach them to global helpers used by the baseline solver.
3. Keep `mountainEnginePilotV1.ts` default-off outside its three existing stage IDs. Do not widen the allowlist until after multi-race acceptance.
4. New work must remain in short-lived feature PRs to `main`, fully tested before any merge. Git merge is **not** a Supabase worker deployment.
5. No race reruns, SQL updates, historical classification changes, result overwrites, artificial time-group edits or changes to game clock. Production stage results remain immutable.
6. Current real race published outcomes are evidence, **not targets to fit precisely**. Use repeatable synthetic inputs for tuning. Do not handcraft a winning group size or riders.
7. Preserve old-engine fallback and in-flight lane binding. At release time, source pins, workers and checkpointed safe mode require a reviewed coordinated deployment and live read-back.
8. Never count successful compilation or a technically `full` replay as proof of realistic racing.

## Current production evidence
Poyang Lakes Stage 7, 108.5 km, declared 2,320 m climbing, flat finish, Cat 2 and Cat 1 climb crests at km 40 and 78. It ran with `engineLaneV1=experimental_mountain_v1`, source `878aa8ae...`, 132 official records, 131 finishers and a technically `full` replay.

**Unacceptable as mountain-physics acceptance:** 82 riders arrive together, followed by no riders until +140 seconds; 50 of 132 riders are shown as individual C groups by the km 78 crest, rather than a natural range of small climbing groups. End-of-stage time spread is +302 seconds. No successful sustained attack at the front. This is not a proof of a general bug on every mountain stage, but it does fail the desired group-shape realism review.

**Route uncertainty:** profile samples show only 685 m cumulative ascent versus declared 2,320 m. Two categorized climbs list only 2.3% and 2.8% average grade, and the finish is 30.5 km after the final classified crest. The difference can arise from coarse samples and does not justify overwriting database route geometry automatically. New diagnostic `mountainProfileAuditV2.ts` reports the discrepancy without altering data.

**Architecture:** the experimental engine source and baseline are the same sporting physics except for one breakaway replay-continuity threshold fix. A separate file alone is **not** a mountain physical model.

## First executable experimental physics prototype (synthetic only)

`src/universal-race-engine/mountainContactPhysicsV2.ts` models travel-time contact using rider climbing/endurance/descending skills, energy reserve, rider pacing commands and physical team support across individually described road segments. Riders accumulate seconds through distance / sustainable speed; groups form only from contact-proximate gaps at observed segment boundaries. Descending and flat terrain can regain time only if a rider travels fast enough; attacks cost extra energy. Its deterministic, pure output is independently testable.

**Integration status: NOT wired to the deployed mountain engine or the authoritative official sporting output.** This is an intentionally separate physics kernel so climb dynamics can be calibrated on repeatable synthetic fixtures before touching the 38,000-line experimental race engine. Rider times, historical published races and baseline worker imports do not change.

Known prototype limits: no gradient interpolator; it requires provided physical segment grades, and it has no weather, drafting field-wide aerodynamics, climbing group pacing collaboration or replay event adapter yet. The next iteration should derive segments from validated profile geometry, add bridge/rejoin lineage and compare physical groups with official outputs under a source SHA controlled simulation.

## Develop mountain-only capabilities in steps

### A. Stage physical profile interpretation
Create a consistent climb-segment representation using actual gradient/distance information where available; capture uncertainty when only coarse sampled elevation or aggregate climbing meters exist. Do not silently invent 2,320 m of hills from 685 m of known ascent. Include hard and rolling-course fixtures.

### B. Climb group dynamics
On each climbing sector, update rider energy and physical contact using sustained power/climbing skill, gradient, position, fatigue, protection and team pacing. Persist physical group memberships at checkpoints, respecting capacity to bridge/catch. Separate the stronger leaders/front groups from later rider groups and individual dropped riders *only when earned by physical calculations*.

### C. Recovery and finish
Allow regrouping on descents/flat roads only with physically achievable time gaps and team behavior. Carry correct contact and time gaps through the final finish calculation. Preserve ranked classification, bonuses, points and replay time accounting.

### D. Acceptance matrix
- **Baseline invariance:** flat, hilly, cobbled, TT, nonpilot mountains and established summit races produce bit-for-bit identical seeded results, replay and classifications from baseline engine when compared at identical inputs.
- **Pilot deterministic:** same synthetic input + seed produces the same engine output and immutable official contracts every run.
- **Mixed climbing scenarios:** sustained steep summit; multiple midstage steep climbs; rolling Cat 1/2 with far-off flat finish; descent/regrouping; weak vs strong climber mix; attempted bridge and breakaway; teams protecting leaders.
- **Physical consistency:** riders never teleport between groups; every merge/split is compatible with positions and actual gaps; replay statuses agree with finish time, rank, incident and DNF.
- **Sporting plausibility:** there should be a sensible variety of leaders, small groups and trailing cohorts on selective synthetic climbs, not a hard-coded universal front group or wholesale fragmentation into dozens of isolated riders.
- **Compatibility:** outputs follow the same contracts used by classifications, GC, points, mountain points, prize money and finished race records. No changes to unrelated races.
- **Release check:** legacy race suite green (inspect actual log, not only GitHub status); isolation tests green; production build green; simulation-only matrix green; checkpointed safe-mode proven; no in-progress pilot cutover; explicit authorized worker deployment and read-back.
- **Production acceptance:** Poyang remains historical immutable baseline evidence; Valdengo–Oropa is the next prospective real-race summit test, but only a genuinely new source SHA and strong verification of climb realism can establish new model success. If calibration isn't ready in time, record Oropa's result as a comparison point, not as validation of new physics.

## Rollout rule
No experimental climbing-physics code moves to production just because these checks were written. Keep this branch as a development contract; add isolated code and run synthetic tests before requesting any release.
