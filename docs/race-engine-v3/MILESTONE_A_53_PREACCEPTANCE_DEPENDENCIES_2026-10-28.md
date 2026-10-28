# Race Engine V3 — Step A53: cross-component pre-acceptance dependency guard

**28 October 2026 — engineering PASS, 75/75 local and 57/57 union safety decisions matched the independent full-field oracle. Sporting NO-GO.**

## Research objective

The previous A52 study found **five unsafe substitutions out of 75 connected-contact component tests** and **four unsafe union substitutions out of 57** when a candidate A50 accepted path replaced the accepted A44 path for only selected riders. The complete A44 and complete A50 solutions were individually swept-collision-safe. The unsafe motion existed only in a mixed-path *hypothetical counterfactual*, never in a committed live race.

A53 implements the missing **pre-acceptance guard** for precisely this case. It records which other riders would collide, **before** accepting a local change, without modifying any existing solver's accepted paths.

## Implementation

- `scripts/v3/a2PreacceptanceDependencyV3.mjs`: pure `auditPreacceptanceDependencyV3(referencePaths,candidatePaths,selectedIds,g,{physicalSeconds})` and independent test-only `auditFullHybridOracleV3`.
- `scripts/v3/verify-a2-step53-preacceptance-v3.mjs`: reproducible comparison with the actual frozen Step52 source scenarios; separate direct synthetic negative test, input validation, identity renaming, lateral reflection, order permutation, and full-field swept oracle.
- `.github/workflows/v3-a2-step53-preacceptance.yml`: bounded GitHub CI, full JSON evidence artifact, historical A52–A39 regression gates, full-stage technical gate and React production build.

The guard requires two **already-safe** accepted path collections with **exactly matching rider identities and initial x/y positions**. It fails closed if the reference or complete candidate path collection is itself collision-unsafe or if inputs are invalid. It then virtually selects only the specified riders' candidate segments, leaving **all other riders' A44 x0/y0/x1/y1 coordinates exactly unchanged**.

Only pairs touching an actually changed path need retesting; unchanged/unchanged pairs are guaranteed safe by the already-validated A44 source. Every selected or cross-boundary pair is checked with the original continuous 2D bicycle swept-collision predicate. A rejected case returns exact blocked rider pairs, contact time within the substep, and whether each collision crosses a selected/unselected boundary.

The output is **SAFE_AS_ONE_SUBSTEP_CANDIDATE** or **REJECT_UNSAFE_SUBSTITUTION**. The word "safe" means only **swept-contact clearance for this one physical substep**, not race approval. It does **not** commit an actual move, apply terminal velocity, change equipment, debit W-prime or alter race classification.

## Validation

[Step A53 CI evidence](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40669638185) contains the complete `a2-step53-preacceptance-evidence` JSON.

The test replays **162 full offline 60-second physical simulations**, comparing A44 and rejected A50 policies in **81 synthetic fixture pairs**, and reproduces all **57** first accepted-path divergences from A51/A52.

It tests the **75 original single-component** and **57 combined-component** Step52 substitutions. Four additional historical-source snapshots are also checked. Every case is independently evaluated by a separate full-field pair sweep. That gives **136 independent oracle evaluations**, with no difference from the guard's accept/reject decision and no omitted or invented blocking pairs.

There were **396 metamorphic tests**, consisting of the same guard decision under reordered input riders, consistent logical rider-ID renaming and lateral mirroring. All passed.

### Measured pre-acceptance classification

| True physical substep | Single-component trials | Safely admissible geometry | Rejected boundary collisions | Union trials | Rejected unions |
|---|---:|---:|---:|---:|---:|
| 0.5s | 31 | **31** | 0 | 28 | 0 |
| 2s (targeted) | 1 | **1** | 0 | 1 | 0 |
| 2.5s | 43 | **38** | **5** | 28 | **4** |
| **Total** | **75** | **70** | **5** | **57** | **4** |

All **five** blocked individual component substitutions have **cross-boundary** swept collisions: the candidate path of a selected rider would overlap an unrelated cyclist left on the baseline A44 path. **Zero** failures were internal-only conflicts in this dataset. This is evidence of geometric dependency across the original input's seemingly separate contact groups.

The guard's five rejected cases reproduce the prior A52 independent full-field oracle. It is not evidence the original A50 complete solver allows a collision; the full A50 trajectories remain collision-free because those other riders move in response.

### Rider motion and energy caveat

The guard also reports changed rider count and the maximum absolute difference in forward displacement, and divides it by the actual physical timestep to describe an **average forward speed difference** between two safe policy alternatives:

| Physical step | Largest measured difference in average forward speed |
|---|---:|
| 0.5s | **5.625m/s** |
| 2s | **3.725m/s** |
| 2.5s | **7.875m/s** |

These are hypothetical **substep average** movement differences, not extra permitted acceleration, authenticated final speed, or a claim of real-race plausibility. Because the isolated hybrid is not advanced through A34's actual energy integrator, the guard deliberately reports `energyLedgerVerified:false` and `energyReevaluationRequired:true` for changed riders. The independent full-race A44 and A50 controls still pass their own W-prime ledger/replay tests, but that does **not** certify the hybrid.

## Four source contact events

The research guard separately reviewed the historical A44 frozen input at the originally established source event:

| Case | Source event | Frozen source pair count | Combined changed-component pre-acceptance |
|---|---:|---:|---|
| Baseline 5m / 8 riders / v1 | 51.0s | 1 | SAFE as one substep geometry |
| Wide 6.5m / 8 riders / v1 | 51.5s | 1 | SAFE as one substep geometry |
| Cautious 5m / 32 riders / v0 | 22.5s | 2 | SAFE as one substep geometry |
| Cautious 5m / 32 riders / v1 | 22.0s | 5 | SAFE as one substep geometry |

The source-event checks are distinct from the **first actual A44/A50 divergence**, which may happen much earlier. A safe source-event hybrid does not mean the entire A50 six-tick simulation is equivalent to A44, nor does it justify retroactively changing stage results.

## Decision and follow-up

**A53 one-substep boundary collision detection PASS. Metamorphic ID/left-right/order checks PASS. All independent safety oracles PASS.**

**A2 numerical, sporting, energy-consistent hybrid and full-peloton validity NO-GO.** The guard does not change the active race solver or certify the selected A50 priority rule, which remains rejected. A new physics algorithm must not treat the guard's "safe" as permission to insert movements into production.

**A54:** evaluate whether the 70 nominally collision-free local replacements can advance into coherent terminal velocity, energy and subsequent contact state, without colliding in the *next* substep or violating exact 10-second replay. Require common-reference classification and source-road realism before a new model is considered. Preserve all five hard local and four union boundary rejections.

No live race, Supabase data, historic results, player payouts, or game-clock changes.
