# Race Engine V3 — Milestone A Step 40: mirrored-road divergence and first-contact normalization

**27 October 2026 — diagnostic 120/120 and normalized policy 480/480 technical passes; sporting NO-GO.**

## Purpose

A39 removed rider-ID priority drift in its opt-in equal-first-contact group candidate, but three of 120 mirrored-road research simulations still produced different final x-positions despite mirrored lateral positions and logically identical rider requests. A40 traced those precise failing cases **before** proposing a limited mitigation. The real racing engine, official results and game's clock were not changed.

## Observed A39 first mismatched accepted substep

The read-only `scripts/v3/audit-a2-step40-mirror-diagnostic-v3.mjs` re-ran all 120 A39 left/right reflection cases and collected per-tick, per-substep trajectories and optional first-contact decisions. It reproduced **exactly three** 60-second counterexamples:

| Road / field / variation | Grid | Max final rider x error | First divergent accepted knot | Small first-knot x deviation |
|---|---:|---:|---|---:|
| Compact 4m, 24 riders, variation 0 | 2s | **2.510809m** | Tick 4, substep 5, r000 | 0.028347m |
| Baseline 5m, 32 riders, variation 1 | 2.5s | **56.272143m** | Tick 3, substep 2, r009 | 0.538063m |
| Cautious 5m, 32 riders, variation 1 | 2.5s | **13.953749m** | Tick 4, substep 2, r010 | 0.000714m |

The compact first conflict involving r001/r005 has normalized first-contact timing **0.00032275294** from one lateral orientation and **0.00032132529** from its reflection. In the cautious case a first fraction around **0.00087263158** versus **0.00087157895** also differs. Both are small, but repeated collision-resolution decisions can magnify changes. The baseline case diverges at a later path knot even though the first two logged pair-conflict times match, so A40 does **not** claim rounding alone fully caused all three discrepancies.

Full case-level data and first few pair decisions are retained in the [A40 diagnostic CI artifact](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40581682583).

## Separate normalized-relative contact research candidate

The new policy is explicitly **opt-in** as `event_time_fair_normalized`, next to the default `symmetric_halving` and the previously rejected A37 and A39 options. It is not enabled for official racing.

This limited experiment changes the **A39 current-substep candidate contact-comparison calculations**, not player intents or power mechanics:

1. Construct each competing pair's *relative* x/y start and endpoint coordinates on a rounded one-micrometre grid.
2. Calculate the corresponding first-contact fraction from those relative coordinates and round the contact-time fraction to six decimal places.
3. Treat a pair as a possible conflict if either the prior real swept test or the quantized relative test says it overlaps; the change is conservative when they disagree.
4. Preserve the original actual raw swept check for the finally accepted paths and the original full-substep safe-control fallback after bounded attempts.

No existing A37 `id_first` or A39 `physical_group` option was modified by this trial; the A34 default remains `symmetric_halving`.

## Verified A40 results

[Actual GitHub Actions normalized-candidate validation](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40582305395) ran four road envelopes, rider sizes 2/8/12/24/32, two variations, grids 2s/2.5s/5s and **four** conflict policies. In total this means **480/480 accepted 60-second technical cases** (including control runs), plus **120** left/right mirrored runs and **96** logical-ID rename runs for the A40 candidate.

Technical checks passed for: independent continuous swept collision clearance on accepted piecewise trajectories, nonnegative finite W-prime, matching individual/aggregate mechanical joule ledger, command immutability, exact 30s checkpoint replays, `officialWrites=0` and `sportingApproval='NOT_APPROVED'`. The previous A39/A38/A37/A36/A35/A34/A33/A32 and complete-stage technical regressions and application build also passed.

| Measure | A34 symmetric control | A39 physical tie groups | A40 normalized-relative candidate |
|---|---:|---:|---:|
| 2.5s maximum x divergence vs 2s | **207.032m** | 229.985m | 239.009m |
| 2.5s reversed rider pairs vs 2s | **626** | 1,164 | 1,242 |
| 5s maximum x divergence vs 2s | **209.147m** | 250.091m | 221.834m |
| 5s reversed rider pairs vs 2s | **759** | 1,104 | 1,028 |
| Full safe-control fallbacks at 2s, across all 40 fixtures | **0** | 30 | 35 |

The two-second trajectory is a *comparison reference, not ground truth*. Counts of pair inversions refer only to synthetic 60-second relative positions; they are not official race classifications.

### Symmetry checks

- **ID-renaming invariance PASSED:** all 96 controlled renaming cases retained their physical outcomes (0 different; max position error 0m).
- **Road reflection FAILED:** 3 of 120 controlled cases still diverged, with largest x disagreement **80.645363m**, worse than the previous A39 maximum of **56.272143m**.
- Failures in the A40 normalized trial occurred in compact-4m / 32-rider / 2s (**80.645m**), baseline-5m / 32-rider / 2.5s (**56.272m**) and cautious-5m / 32-rider / 2.5s (**13.954m**).

The normalized test passed technical checks because the accepted physical paths remained safe, not because their x/y trajectories were numerically equivalent across reflections or resolutions. The difference between these two acceptance goals is explicit in the JSON CI evidence.

## Gate decision and next research

**A40 root-cause localization and controlled candidate evaluation COMPLETE; `event_time_fair_normalized` remains REJECTED as a sporting replacement.** A40 did not fix mirror symmetry and materially worsened active-merge numerical order stability at 2.5s compared with the original conservative research approach.

A41 should treat coordinate and reflection symmetry as an independent mathematical validation problem. Test exact canonicalized physical orientation (and its own assumptions and limitations), separate it from first-contact priority and symmetric fallback choice, and require no difference between mirrored geometry/rider commands in a matched field. Only after that should movement/energy accounting and 2s/2.5s/5s peloton sporting realism be reconsidered. Neither symmetry nor ID invariance alone is sufficient.

**Milestone A2 sporting status: NO-GO. Milestones B/C: NOT STARTED.** No live race selector, historical results, player clubs, Supabase data, game clock or payouts were changed by the Step40 research files.
