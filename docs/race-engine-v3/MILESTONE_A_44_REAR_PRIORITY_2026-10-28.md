# Race Engine V3 — Milestone A Step 44: physical longitudinal priority vs lane-entry priority

**28 October 2026 — targeted technical study complete; one candidate improved all tested synthetic timestep aggregates; no sporting authorization.**

## Scope and safeguards

Following A43's discovery of timestep-dependent acceleration distance, Step 44 independently tests whether more defensible **physical collision priority** can reduce time-grid instability rather than merely changing how many conservative movement halvings occur.

Two new explicitly opt-in policies use A43's existing trapezoidal clear-motion integration:
- `trapezoid_rear_priority`: if conflicting riders are in a clear longitudinal order, reduce the *physically rear* rider's movement; the front rider retains its provisional movement unless other conflicts require otherwise.
- `trapezoid_lane_priority`: if only one of two conflicting riders is actively steering into or across another rider's corridor, reduce the entering rider first; otherwise give rear priority for straight-ahead collisions or reduce both in ambiguous geometry.

Both candidates consider **every conflicting pair concurrently** in an iteration rather than giving priority by alphabetical rider ID, and both limit any unilateral search to **64 rounds**. When unilateral decisions do not settle, they restart from original proposals with the original safe **A34 symmetric-halving** fallback. All accepted paths pass the original continuous bicycle swept overlap predicate. The new solver remains strictly under `scripts/v3/` research-only files and is not part of active gameplay or production results.

A prior CI attempt failed because a **mirrored input coordinate for the 6.5m scenario was rounded microscopically above the original validated upper road bound**. The test-only mirror starting position was clamped to the same original validated bound. The physical algorithm and collision safety thresholds were not relaxed. The corrected matrix passed.

## Test scope and verified technical results

The [completed A44 GitHub Actions run](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40652922354) runs:

- **800** 60-second simulations across 4 provisional roads, field sizes 2/8/12/24/32, 2 control variations, **all five physical quantum sizes 0.5/1/2/2.5/5 seconds**, and four distinct policies: original A34 symmetric, A43 trapezoid, A44 rear-priority and A44 lane-entry priority.
- **64** optional-policy logical-ID permutation runs at 0.5s (32 per policy), with initial riders and all 10-second physical control demands held constant.
- **80** optional-policy mirrored road runs at 0.5s (40 per policy), with left/right physical positions and steering commands reflected.
- Two additional minimal isolated pair fixtures establish that the front cyclist stays unimpeded in a pure rear-contact pair and a lane entrant is yielded when it alone steers.

Every accepted run has zero independently observed piecewise swept collisions, finite nonnegative W-prime, energy-ledger consistency, unchanged rider commands, and bit-identical JSON restart/replay from tick 3 to tick 6. No official writes. These are *synthetic 60-second 2–32 rider traffic cases*, not 106/168 rider full races. No claim of calibration is made.

The separate regression/build job reruns A43 through A32 and completed-stage technical safety tests plus the React production build, with separate legacy-isolation workflow. **Technical green is not sporting authorization.**

## Results — each policy compared with its OWN 0.5-second physical reference

| Grid | A43 trapezoid max x difference | Rear-priority max x difference | A43 pair inversions | Rear-priority pair inversions |
|---|---:|---:|---:|---:|
| 1s | 239.187501m | **103.666590m** | 920 | **347** |
| 2s | 219.270139m | **143.535091m** | 1,119 | **429** |
| 2.5s | 220.420259m | **166.014490m** | 823 | **511** |
| 5s | 221.852815m | **136.865462m** | 813 | **608** |

Maximum front gap deviations also improved at all four time grids: relative to A43 control, **239.150→103.679m** at 1s, **219.645→143.648m** at 2s, **220.170→166.628m** at 2.5s, and **229.866→133.978m** at 5s. These are the first simultaneous across-grid improvements seen in this sequence against the acceleration-corrected baseline.

**Identity and mirror metamorphics:** rear priority was **0 of 32 ID-renamed tests changed** and **0 of 40 reflected-road tests changed** in the 0.5s matrix, including final x, y and W-prime and logical relative rankings.

**Important limitations:** even 103.7m of worst-case 1s deviation and 347 reversed positional rider pairs after only 60 seconds remain large. Moreover, summed pair reversals and worst-case maximum error cannot prove that every individual configuration improved. The **148** full-substep fallback episodes at 0.5s, followed by **30 at 1s**, **10 at 2s**, **12 at 2.5s**, and **0 at 5s**, demonstrate persistent contested-resolution failure modes. A fallback is a safe rejection of a proposed unilateral solve, **not a crash**.

## Rejected lane-entry variant

The `trapezoid_lane_priority` policy changed physical ranks and outcomes substantially more unpredictably. Although its 1s positional error (206.94m) and pair reversals (672) improved versus A43, it worsened 2s max position difference to **279.94m**, 2.5s inversions to **1,076**, and 5s inversions to **1,139**. The policy also generated **2 of 40** reflected-road discrepancies at 0.5s and **691** full safe-control fallback episodes at 0.5s. It is therefore **REJECTED** for further sporting promotion. Both optional policies remain disconnected from player racing.

## Decision and next bounded work

**A44 engineering, safety, ID symmetry and aggregate timestep-improvement criteria PASS for opt-in rear priority. A2 overall sporting readiness remains NO-GO.** The front-priority heuristic is currently the strongest *research candidate*, not an accepted race engine. Until calibrated stage data and authentic 106/168-rider race dynamics are tested, it is premature to permit results, payouts, classifications or any production game-clock change.

**A45 next:** audit per-fixture changes and all conservative fallback cases, including whether rider overtakes, collisions of moving lanes and lane-dependent precedence obey defensible cycling realism. Expand the physics reference beyond one synthetic minute, with independent exact checkpoint recovery and source-accurate stage geometry. Preserve the physically causally consistent acceleration and all-pair swept clearance. Reject any suggestion to activate a candidate solely because its aggregate pair inversion count is lower.

A2 NO-GO. Milestones B and C NOT STARTED. **No production game engine, official result, Supabase, live race or game-clock change.**
