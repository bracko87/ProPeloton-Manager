# Race Engine V3 — A2 physically feasible unilateral yield choice audit

**27 October 2026 — DIAGNOSTIC TECHNICAL PASS; SPORTING NO-GO; LIVE ENGINE UNCHANGED**

## Precise question

[The previous crossing-aware research candidate](MILESTONE_A_15_CROSSING_AWARE_2026-10-27.md) tagged a handful of fast trailing rider / separate intended lane conflicts but changed **zero** real unilateral-yield decisions. There were three possible structural explanations: only one unilateral collision-free movement attenuation was feasible, two existed but one was too costly, or score/tie preference was ineffective.

This audit counts the actual choices **inside the existing resolver**, using its unchanged 32-step discretized unilateral path reduction search and full swept bicycle collision test. The only new data are counts of zero, one and two unilateral choices and reasons when a candidate pass could not change the choice.

Importantly, **no lane authorization, movement speed, collision checker, rider energy, priority scoring or physical solver rule was changed**. The diagnostic is additive to isolated offline research files only, with a micro-test asserting byte-exact rider/energy outcomes against the original targeted solver and exact serialized checkpoint recovery.

## Verified technical execution

- Code: [physics-neutral audit instrumentation](../../scripts/v3/simultaneousCrossingAwareResolveV3.mjs), [energy-preserving research adapter](../../scripts/v3/simultaneousCrossingAwareMicroV3.mjs), [exact parity micro test](../../scripts/v3/verify-a2-yield-options-v3.mjs), [repeated four-grid audit](../../scripts/v3/audit-a2-yield-options-v3.mjs).
- Commits: [option counts and strict physics parity](https://github.com/bracko87/ProPeloton-Manager/commit/4eddf1dedefeae39c7b636ae8c5724fe4402505d), [full scenario audit](https://github.com/bracko87/ProPeloton-Manager/commit/0ebe438177a12a84a42ce78a43bc1d06f9263298).
- [GitHub Actions: all 12/24/32 diagnostic jobs SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40484325612), including the existing 2D finish/collision regressions, energy-state equivalence, exact JSON diagnostic replay, simulated collision checks and application production build (12-rider job).
- Three roster sizes (12/24/32) × three modes (passing corridors, dense following, merging) × four starting grids (original, two-rider swap, uniform two-lane rotation, nonuniform alternating-row swaps) × ninety 10-second ticks = **36 synthetic traffic scenarios**; these are **not complete road stages**.
- Original numeric artifacts retained for 30 days: `v3-a2-yield-choice-12`, `v3-a2-yield-choice-24`, `v3-a2-yield-choice-32`. Each contains all per-grid counters and micro mobility totals, including the exactly replayed state checks.

## Decision-level conflict feasibility across all 12 scenarios for each roster size

| Number of repeated conflict decisions | 12 riders | 24 riders | 32 riders |
|---|---:|---:|---:|
| Colliding pairs at solver iterations | 9,256 | 52,970 | 86,171 |
| Zero single-rider safe attenuation choices | 0 | 218 | 0 |
| **Exactly one safe single-rider choice** | **9,131** | **52,106** | **85,002** |
| Both rider-yield alternatives safe | 125 | 646 | 1,169 |
| Conflicts tagged for faster trailing rider protection | 35 | 77 | 86 |
| **Tagged conflicts with only a single safe option** | **35** | **77** | **86** |
| Tagged conflicts with zero alternatives | 0 | 0 | 0 |
| **Tagged conflicts with two safe options** | **0** | **0** | **0** |
| Tagged conflicts whose only viable yielding rider was protected trailer | **35** | **77** | **86** |
| Real priority-induced yielding decisions switched | **0** | **0** | **0** |

The totals count **conflict edges on repeated solver iterations**, not unique rider pairs, unique attempted overtakes or finished-race classifications. Even when two options exist in some other collision edges, **none coincide with an eligible protected-trailing-rider situation** in the tested configurations. The original candidate thus cannot avoid yielding the protected trailing cyclist without changing the *feasible geometry or the joint trajectory construction*. Changing its scoring weight from 10m to a much larger number would still not create a missing second safe unilateral option.

### Feasible two-choice conflicts exist elsewhere

| Sacrificed-metre cost difference between two safe alternatives | 12 | 24 | 32 |
|---|---:|---:|---:|
| Up to 2m | 78 | 258 | 423 |
| More than 2m, up to 10m | 41 | 359 | 652 |
| More than 10m, up to 25m | 6 | 26 | 72 |
| More than 25m | 0 | 3 | 22 |

These are **independent of the protected-trailer condition**; do not interpret a low cost gap as proof a safe *pass* was possible. A unilateral reduction may prevent the attempted crossing altogether.

In the passing-corridor mode's **original starting grid**, the protected conflicts were **8, 19, 19** for 12, 24, 32 riders respectively; in the localized two-rider swap they were **5, 14, 14**, and in the nonuniform row swaps **6, 15, 15**. Every tagged conflict in every grid had only one unilateral safe yield.

## Engineering and sporting interpretation

**Technical PASS:** the instrumentation accounts exactly for every tested conflict edge and reproduces historical offline control paths and rider energy. It operates at a 10-second step with synthetic rider powers, scripted intentions and synthetic lane geometry; production race results and game clock are unmodified.

**Candidate remains SPORTING REJECTED.** We have now established a **structural reason** for no policy activation under these inputs. Selecting a winner among existing unilateral alternatives cannot preserve a requested overtake when the only swept-collision-safe unilateral reduction yields the faster trailing rider. The next bottleneck is not priority choice but **passing corridor construction and coordinated intent**.

### Boundaries / caveats

- The "no alternative" result is relative to the solver's **32 discrete quantized reduction candidates** on one rider's frozen proposed trajectory while holding the other rider's plan unchanged. A different *coordinated* two-rider trajectory, speed adjustment, early anticipation or continuous optimization might be safe; the experiment has not proved those impossible.
- Geometry includes an artificial 5m-road fixture. No source-confirmed road widths, route elevation, rider body collision-envelope calibration, wind, tactical team interaction, or real racing overtaking tolerance were validated.
- The earlier baseline still lacks 718m Guangxi and 1,065m World Nations climbing fidelity and needs sub-tick finish W-prime correction and historical breakaway / pursuit tests.
- A highly mobile and collision-safe microsimulation is not evidence of realistic live cycling or stage results.

## Next precisely bounded A2 gate

Build an **offline-only corridor feasibility / multi-tick anticipation test**, first using 2–6 carefully specified bicycles and frozen obstacles with actual relative-position geometry. Explore early lateral placement and coordinated speed reduction, not numerical privilege. Require exact swept collision clearance, finite power / W-prime, sustained 30/60s actual passing, full deterministic replay and no suppression of unrelated riders. Establish the size of a **safe physical corridor** needed and whether the synthetic 5m width permits it under the bicycle envelope. Only if micro-passing scenarios succeed without unrealistic group halts should 12/24/32 traffic and eventually 106/168 complete stages be attempted.

**Milestone A1 technical PASS; A2 sporting NO-GO; Milestones B/C NOT STARTED. Official writes 0.**
