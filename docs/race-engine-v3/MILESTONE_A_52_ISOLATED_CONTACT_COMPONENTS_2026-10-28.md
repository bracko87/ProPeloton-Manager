# Race Engine V3 — A52: isolated collision-component counterfactuals

**28 October 2026 — diagnostic technical PASS; sporting and full-peloton readiness NO-GO.**

## Question

A51 reproduced the rejected A50 algorithm's first different accepted movement using identical frozen A44 input, then observed its effect spreading beyond the original collision group. A52 asks a more restrictive question: **can an A50-resolved component replace only the same riders' A44 accepted substep paths, while every unrelated rider keeps the exact originally accepted A44 trajectory?**

Unlike a full A50-versus-A44 run, this holds unrelated riders fixed for that one physical substep. It is a **counterfactual collision-safety experiment**, not a plausible 60-second re-simulation with artificially pinned cyclists.

## Implementation and physical invariants

New isolated source observer: `scripts/v3/a2IsolatedContactComponentAuditV3.mjs`; audit driver: `scripts/v3/audit-a2-step52-isolated-components-v3.mjs`; CI: `v3-a2-step52-isolated-components.yml`.

For the first accepted-path disagreement, the observer:

1. Reconstructs the 2D swept-contact graph from **the actual frozen rider proposals** and independently checks the graph matches the recorded A44 preview pairs. Components consist of riders joined by provisional swept collisions, not simply cyclists in adjacent visual lanes.
2. Runs unchanged A44 rear priority and rejected A50 earliest-contact/occupancy resolution against **exactly the same cloned frozen input**; verifies no proposal mutation, complete swept safety and expected A51 first-step differences.
3. For every original conflict component whose members actually move differently, creates a *hybrid* using **A50 accepted movement inside that group, A44 accepted movement for all unrelated riders**. Asserts every unrelated rider's full proposed-to-accepted segment remains byte-for-byte unchanged. Checks every pair in the entire field for swept overlap.
4. Separately examines the union of those affected components, again keeping all remaining riders on their A44 accepted paths. **A blocked hybrid is rejected evidence, not an allowed collision.**
5. Simulates just the **first attenuation round** from the same frozen proposals: (a) only the earliest or genuinely simultaneous earliest A50 contact set yields; (b) all A44 rear-priority conflicted pairs yield in the same round. Records remaining and newly induced pair conflicts. Subsequent rounds and longer observed differences are kept distinct.
6. Reuses A51's validated 60-second trace of speed, W-prime and displacement, without claiming the one-substep hybrid itself has a validated energy ledger or complete-stage sporting classification.

## Completed study

[Step 52 GitHub Actions](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40667608239) exercised **162 full offline physical simulations**, forming **81 same-grid A44/A50 comparisons** (40 synthetic road/roster cases each at true 0.5s and 2.5s, plus one targeted 2s cautious-road case).

All **57** previously established first accepted-path differences were reproduced with identical source proposals. Existing 2D swept safety, finite W-prime, unchanged command submission and exact serialized midpoint replay gates were preserved. The source graph and all independent resolver paths were rechecked.

### Local intervention results

| Physical substep | Compared fixture pairs | Originally different first motions | Connected-component substitutions | Swept-safe substitutions | Collision-blocked substitutions | Safe union substitutions |
|---|---:|---:|---:|---:|---:|---:|
| 0.5s | 40 | 28 | 31 | 31 | 0 | 28/28 |
| 2s (targeted) | 1 | 1 | 1 | 1 | 0 | 1/1 |
| 2.5s | 40 | 28 | 43 | 38 | **5** | **24/28** |
| **Total** | **81** | **57** | **75** | **70** | **5** | **53/57** |

The **five** blocked single-component substitutions, and **four** blocked 2.5s union substitutions, demonstrate a dependency between an originally connected contact group and riders outside that group under the two different policy trajectories. Even when two full solver outputs are individually swept-safe, mixing locally accepted solutions need not be safe.

This test does not prove that the unsafe hybrid was ever committed by either solver. It was not. It also does not prove a unique causal sporting right-of-way preference.

### First-round competition and conflict growth

Across the 28 divergent half-second cases, initial proposal graph reconstruction found **54 conflict pairs** and ten first-round simultaneous earliest-contact tie groups. At 2.5s there were **119 initial pair conflicts**, with **13** first-round tied groups. Using just the first halving decision, new provisional contact pairs arise:

| Substep | New contacts after earliest-only A50 first round | New contacts after A44 all-pair rear first round |
|---|---:|---:|
| 0.5s | 4 | 4 |
| 2s (one case) | 2 | 2 |
| 2.5s | **16** | **14** |

The 2.5s difference is modest in aggregate but matters in particular dense physical conflict graphs: resolving only the first pair does not isolate the effect to that original pair, and changing a moving cyclist's path can create a new conflict with someone who did not belong to the original proposal graph.

### Historical frozen source cases

- **Baseline 5m, 8 riders, v1, 0.5s:** the actual first A44/A50 difference was at **32.5s**, source component `r000/r004`. The A50 variant of this single component is collision-safe when the other six riders keep their original A44 accepted paths. By 60s full rerun, four riders differ, including two outside the original component.
- **Wide 6.5m, 8 riders, v1, 0.5s:** the first difference was at **13.5s**, source component `r003/r007` even though **three** first-contact pairs tied at the same event-time fraction. Local isolation is swept-safe; all eight riders differ in the full 60-second replay.
- **Cautious 5m, 32 riders, v0, 2.5s:** first difference **22.5s**, two original contact components, but the full frozen A50 output changes accepted motion for **seven riders**, some beyond both source components. Each single-component intervention was safe here, and the union is safe, but full A50 60s output eventually differs for **27 riders**, including **23** outside the original first affected components.
- **Cautious 5m, 32 riders, v1, 2s:** first difference **14s**, with **nine** tied earliest contact pairs spanning several original components. Replacing only the affected `r027/r031` component is safe while the other 30 riders' A44 accepted tracks remain identical. By 60s the full A50 result differs for **31 riders**, 29 outside the first component. The later historically interesting 22s contact is reached with different prior trajectories in the two runs.

## Outcome and next bounded work

**A52 original source graph verification, cloned physical counterfactual, full-field hybrid swept safety, frozen outside paths, existing energy/replay and source-case reproduction PASS.** All collision-blocked hybrids are classified as experimental counterexamples, not accepted rider movements.

The evidence rejects any simplistic claim that previously distinct source contact components can be resolved independently and their resulting accepted paths stitched back into the full field. **A2 sporting and physical convergence NO-GO.**

**A53 should build a pre-acceptance dependency check** that detects cross-component interference and rejects unsafe substitutions before changing accepted motion, while demonstrating correct source steering/velocity/energy behavior and mirror/identity symmetry. A future full physically meaningful contact model still requires source-calibrated real road profiles and full 106/168-rider stage scenarios; the present numerical source is 2–32 synthetic cyclists only.

No production solver, Supabase tables, official results, race payouts or game clock were changed.
