# Race Engine V3 — Milestone A2: targeted yielding versus symmetric collision attenuation

**Date: 27 October 2026. Engineering micro/stress gate PASS. Sporting gate remains NO-GO. No production racing changes.**

## Problem and controlled intervention

[A2's previous sustained simultaneous-motion stress study](MILESTONE_A_12_SIMULTANEOUS_STRESS_2026-10-27.md) showed safe but extreme transient collective slowing: the worst 32-rider passing tick fulfilled only **4.60%** of requested movement. Its canonical micro solver halves the movement of *both* riders involved in a predicted collision until all swept paths are clear; this can propagate to additional bicycles.

We implemented an **isolated offline-only targeted-yield counterfactual**, leaving `scripts/v3/simultaneousConflictResearchV3.mjs`, the existing coupled 2D research engine and the live race engine unchanged.

Code: [targeted conflict resolver](../../scripts/v3/simultaneousTargetedResolveV3.mjs), [isolated micro adapter](../../scripts/v3/simultaneousTargetedMicroV3.mjs) and [micro assertions](../../scripts/v3/verify-a2-targeted-yield-v3.mjs), initially committed at [`f5bce7d4`](https://github.com/bracko87/ProPeloton-Manager/commit/f5bce7d4a228b3897d79d985afa5a948a7471bb9), with a [reported-iterations fix](https://github.com/bracko87/ProPeloton-Manager/commit/1b718991303ae464e999cc20da74451f8d2a27d3). The 12/24/32-roster comparison suite was added at [`a4cdc2af`](https://github.com/bracko87/ProPeloton-Manager/commit/a4cdc2af6c43fd3210e7a47ccb8a78e3df77fefa).

The counterfactual uses the same prior-tick frozen motion proposals and same bicycle swept-collision checker. For each colliding pair it scans possible reductions to *one* rider's forward/lateral trajectory, retaining as much movement as possible. When neither rider alone can safely yield, both are attenuated. Every candidate must reach a final condition where **all rider-pair swept paths are non-colliding**. A deterministic rider-ID tie-break and a trailing-rider tie preference keep output reproducible, but their sporting fairness is not yet established. The algorithm is a model hypothesis, **not a validated simultaneous multi-agent optimization method**.

## Micro-gate verification

[Targeted micro test: SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40479568463). Collision checks, multi-rider merging, finite W-prime, input-array permutation and serialized checkpoint recovery pass; the production build also passes.

In the controlled two-rider same-lane conflict, the symmetric prototype achieved **77.5 combined metres**, versus **147.03125 metres** after targeted yielding, with continuous collision clearance. One controlled pair is not a sporting pass.

## Extended 90-tick micro traffic matrix

[Targeted versus symmetric CI: SUCCESS, 12/24/32 riders](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40479787270). For each of the three roster sizes, both solvers ran four matched 900-s scenarios: dense following, passing corridors, repeated merging and separated groups. **24 individual scenario runs** passed the scripted technical and replay checks. Full JSON records are retained in 30-day GitHub Actions artifacts `v3-a2-targeted-comparison-12`, `v3-a2-targeted-comparison-24` and `v3-a2-targeted-comparison-32`.

### Forward movement achieved as share of requested metres

| Scenario | 12 symmetric | 12 targeted | 24 symmetric | 24 targeted | 32 symmetric | 32 targeted |
|---|---:|---:|---:|---:|---:|---:|
| Dense following | 83.15% | **93.84%** | 81.38% | **90.36%** | 80.77% | **90.10%** |
| Passing corridors | 83.83% | **92.75%** | 78.79% | **90.43%** | 77.97% | **89.01%** |
| Repeated merging | 92.06% | **97.11%** | 81.66% | **92.91%** | 77.99% | **91.69%** |
| Separated groups | 92.86% | **96.95%** | 87.06% | **94.09%** | 65.10% | **91.05%** |

### Passing-corridor sporting diagnostics

| Measurement | 12 symmetric | 12 targeted | 24 symmetric | 24 targeted | 32 symmetric | 32 targeted |
|---|---:|---:|---:|---:|---:|---:|
| Worst 10s tick requested movement achieved | 10.40% | **86.06%** | 5.71% | **84.44%** | 4.60% | **83.62%** |
| Near-halted rider-seconds | 660 | **0** | 1,690 | **0** | 2,400 | **0** |
| Longitudinal pair-crossing events | **66** | 34 | **202** | 117 | **442** | 190 |
| Total lateral metres | 4 | 4 | 8 | 8 | 10 | 10 |

In the 32-rider passing case, the targeted rule improves aggregate progress by **11.04 percentage points** and the worst tick by **79.02 points**, while decreasing longitudinal pair-crossing events by approximately **57%** (442 to 190). Other scenarios also show large decreases in crossing events: dense following 779→157, separated groups 1,048→72. Such events are not unique tactical passes and may include oscillatory overtakes, but this is a **material sporting trade-off**, not unqualified improvement. Smoother wheel-following may result from deferring passing opportunities.

The candidate removes near-halted rider-seconds under the specific 0.5m/tick threshold in all four tested traffic scenarios and all three roster sizes. It does not establish realistic cycling speed, bunch dynamics or tactical attacks.

### Conflict-graph diagnostics

The targeted prototype records first-proposal connected conflict components, the largest initially conflicting component, number of unilateral yield decisions and pairwise symmetric fallbacks. In the 32-rider cases, the largest initially conflicting components were **6 riders** for dense following, **10** for passing and merging, and **4** for separate packs; the counterfactual's original-grid results reported no pairwise fallback. These counts explain which local interactions are present but do not by themselves establish sporting correctness.

## What passed / what did not

**Technical PASS:** all 12 candidate traffic runs and 12 baselines completed repeated swept-collision checks, nonnegative energy, deterministic replay, order invariance and separated-pack independence. Existing 2D collision/finish micro regressions, independent app build, and the isolated research gate were retained. The initial candidate CI failure was a typo in an output property (`iterations`) and was corrected before accepting results.

**Sporting FAIL / NOT READY:** the intervention can greatly reduce momentary slowdown at a cost to crossing activity. We have not proven that this is genuine suppression of overtakes rather than elimination of unrealistic repeated pass/repass oscillations. There is no historical passing benchmark, no multi-grid stability assessment of this new prototype, no full-stage 106/168-rider classification or authentic drafting/breakaway dynamics, and no source-verified road width/ascent or sub-tick finish energy.

**Decision:** retain this algorithm as an **off-by-default research candidate only**. It should **not** be promoted into the canonical coupled 2D engine or the live game.

## Next bounded gate

Instrument **unique rider-pair overtakes**, repeated back-and-forth crossings, persistent passing versus re-passing within 30–60 simulated seconds, and leader/follower yielding under at least three starting-grid permutations. Then compare targeted and symmetric methods at identical 12/24/32-rider input and road geometry with predeclared thresholds. If crossing losses mainly remove unphysical oscillation without suppressing sustained overtaking or altering classification, proceed to full-stage work. Otherwise revise the strategy. Independently repair historic stage profile and genuine width sources before realism approval.

**A1 technically passed; A2 still sporting NO-GO; B and C not started. Official production race and Supabase result writes: 0.**
