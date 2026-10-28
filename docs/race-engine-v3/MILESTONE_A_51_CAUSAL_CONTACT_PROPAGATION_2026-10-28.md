# Race Engine V3 — Milestone A Step 51: frozen-contact decision and downstream propagation

**28 October 2026. Research-only technical PASS, sporting NO-GO.**

## Research question

Step A50 demonstrated that first-contact-first lane-occupancy yielding passes collision safety and ID/mirror symmetry, but is a serious **sporting/numerical regression** against a shared A44 0.5-second reference. The crucial unresolved issue was whether a decision involving one or two riders can produce downstream position, speed and energy changes across a much larger peloton group.

Step A51 adds **no new solver policy**. It compares the unchanged A44 rear-priority research solver and the opt-in, rejected A50 first-contact occupancy solver using actual frozen substep proposals and accepted motion, then observes later outcomes. Neither policy controls production racing.

## Method: distinguish a controlled counterfactual from subsequent propagation

The new `scripts/v3/a2ContactPropagationAuditV3.mjs` observer performs two different analyses.

**Controlled first substep:** at the **first accepted path divergence** between same-grid physics, reconstruct the identical rider proposals from the A44 diagnostic trace, including original longitudinal/lateral positions and proposed forward/lateral movement. Run the A44 and A50 resolver on **cloned identical inputs**. Prove proposals remain unchanged, and check the recomputed A44 motion equals the original A44 accepted knots. When the real A50 run begins that substep with identical proposals, check the recomputed A50 motion equals its accepted knots. Build all original provisional swept-contact pairs and their connected components, and identify riders with distinct one-step motion *in the frozen counterfactual*.

**Observed subsequent propagation:** after each of six actual 10-second ticks, compare actual rider x/y, terminal speed, W-prime and cumulative mechanical joules under the two original policies, measuring which changed riders belong to the **initial** connected-contact group and which are outside it. This later comparison is observational: repeated dynamics and other contacts can transmit the difference, and it is not randomized proof that exactly one pair caused all affected downstream rider movement.

A full detailed JSON record includes first contact, group membership, changed riders, tick-level maxima, final outcomes and the four previously established source events. Both simulated policies' accepted swept paths, W-prime accounting, exact serialized midpoint replay and immutable commands retain the existing technical checks.

## Completed experiment

[Successful A51 CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40665806774) verifies 40 synthetic scenarios (four provisional road envelopes × five field sizes 2,8,12,24,32 × two control variations) at **0.5s** and **2.5s** real physical grids for both policies, plus the additional cautious 5m/32 rider/v1 **2s** source comparison. This gives **162 physical 60-second runs** and **81 matched A44/A50 policy comparisons**.

All runs passed accepted continuous swept-collision checks, W-prime constraints, ledger checks, exact JSON checkpoint replay, no modified commands, and zero official writes. In **57 of 81 comparisons**, A44 and A50 have different accepted paths; in **all 57**, the first difference occurs with **identical frozen rider input proposals**, which is necessary for a clean same-source resolver comparison. In **five** such comparisons, the very first accepted movement also changes at least one rider outside the originally selected source-contact component, highlighting competing interactions during the bounded solver itself.

An early audit summary incorrectly counted null/non-divergent traces as observed external propagation; that filter was tightened to count only actual finite first-spread tick times. The corrected results below come from the successful final run.

### Quantified spread

| Physical step | Fixture comparisons | Different accepted paths | Difference eventually outside first contact graph | Maximum riders differing by 60s | Maximum longitudinal position difference by 60s | Maximum W-prime difference by 60s |
|---|---:|---:|---:|---:|---:|---:|
| 0.5s | 40 | **28** | **28** | **29** | **195.191m** | **71.991J** |
| 2s (one targeted fixture) | 1 | **1** | **1** | **31** | **244.802m** | **27.068J** |
| 2.5s | 40 | **28** | **22** | **31** | **293.734m** | **43.115J** |

The group maximum is across all fixtures at the resolution, not a claim that every row's maximum belongs to one scenario.

## Four historical source spotlights

These use the original A44 frozen source collision at the stated time, and also report the **actual earlier first divergence** if the rejected candidate had already taken another trajectory.

| Source fixture | Historical source contact | First actual A44/A50 accepted divergence | Final affected riders | Affected outside original contact group | Worst x / speed / W-prime difference at 60s |
|---|---:|---:|---:|---:|---|
| Baseline 5m, 8 riders, v1, 0.5s | 51s, r004/r005 | **32.5s**, r000/r004 conflict | **4/8** | **2** | 89.427m / 9.500m/s / 2.132J |
| Wide 6.5m, 8 riders, v1, 0.5s | 51.5s, r004/r005 | **13.5s**, multiple tied contacts | **8/8** | **6** | 120.537m / 9.500m/s / 71.991J |
| Cautious 5m, 32 riders, v0, 2.5s | 22.5s, competing r017/r020 and r023/r030 contacts | **22.5s**, earliest r017/r020 | **27/32** | **23** | 175.000m / 9.499m/s / 0J |
| Cautious 5m, 32 riders, v1, 2s | 22s, five provisional source conflicts | **14s**, nine earliest tied conflicts | **31/32** | **29** | 244.802m / 9.236m/s / 27.068J |

The 22.5s cautious case is especially informative: despite only two initially recorded provisional conflict pairs, the **same frozen input** processed by the two strategies yields changed motion for **seven riders** in the one-step counterfactual. By 60 seconds, 27 riders differ. That shows why ranking the "one earliest pair" in isolation is insufficient: resolving it changes the constraints presented to other overlapping paths within the current physical step, and later pack dynamics spread effects further.

For the cautious 2s/variation-1 case, the candidate has **nine tied earliest-contact pairs at 14s**, including straight closing and ambiguous mutual contacts. A50's own source geometry at the later historical 22s point includes **16** proposed contact pairs against **five** in A44. Thus the candidates enter that historically interesting point with materially different prior states; attributing all later differences to r021/r024 at 22s would be misleading.

The reported 9.5m/s differences in terminal speed and 70+J energy differences after one minute are additional evidence that the experimental collision response is far from robust; they are not evidence that real cyclists have those measured dynamics.

## Engineering outcome, limits and next step

**Step A51 frozen-input reconstruction, connected-group graph, multi-tick movement/velocity/energy audit and existing swept-safety, energy and replay gates PASS. A2 sporting and time-grid convergence still NO-GO.** The test proves reproducible immediate *solver choice* differences and documents later spread. It does **not** establish a unique physical causality path for all riders; that requires interventions holding all unrelated physical paths fixed and observing which contact-component choices are necessary/sufficient.

**Step A52** should run isolated connected-component interventions on actual frozen proposals, with all outside riders' provisional motion held fixed and swept-safe acceptance checked against the full field. It should distinguish contact-time-tie decisions from sequential graph growth and test physically justified yield/velocity/energy constraints without inventing a sporting result. No new global scoring rule should be activated merely because it reduces aggregate inversion numbers.

The current A34–A50 research solver remains limited to 32 riders and provisional 60s synthetic traffic patterns. Full 106/168-rider stages, sourced road width and elevation, drafting, attacks, whole-stage time/gap/classification realism and B/C player integration remain blocked.

**Milestone A2 sporting NO-GO. Milestones B and C NOT STARTED. No live race-engine switch, official result write, player payout, Supabase mutation or game-clock change.**
