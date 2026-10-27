# Race Engine V3 — A2 Step 38: active-merge priority and symmetry diagnosis

**27 October 2026 — observational diagnostic technically PASS; rider-ID fairness FAIL / sporting NO-GO.**

## Why this diagnostic matters

The preceding [A37 rear-yield trial](MILESTONE_A_37_EVENT_TIME_YIELD_2026-10-27.md) showed reduced congestion and better timestep consistency in pure following and fixed lanes but **worse** ordering and positional stability during active merging. In that experiment, each current-substep conflict is sorted by predicted first contact time, and if two conflicting pairs have exactly the same earliest time, the code breaks the tie by their **rider IDs**. Such arbitrary identifiers should not be allowed to change physical race results.

Step A38 does not introduce another physical policy or change collision decisions. It adds optional event traces **only when diagnosticTrace is explicitly enabled**, while the original symmetric-halving solver remains the default. A trace records contact-time fraction, the two pair IDs, the rider selected to yield, whether the pair had a one-way or common lateral direction, how many bounded reduced-motion candidates were rejected as unsafe, whether a partial/whole symmetric fallback was required, and the number of simultaneously earliest pairs.

## Precisely reproduced comparison

[GitHub Step38 validation](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40554853682) executed the trace and all earlier A37/A36/A35/A34/A33/A32 micro research and finished-stage technical regressions, plus the application build, against the real repository code.

The controlled core consists of **four synthetic road envelopes × five rider-field sizes (2, 8, 12, 24, 32) × two rider-command variations × three substep sizes (2s, 2.5s, 5s)**, giving 120 resolution-matched cases and **240 runs** including one A37 trial and one unchanged A34 symmetric baseline for each. Every run lasts 60 simulated seconds (6×10s outer control ticks), with immutable rider-specific inputs and checkpoint replay.

Additional fairness checks at 2.5 seconds:

- **40 road-reflection runs:** mirror all riders and lateral commands from left to right. The same logical cyclist, numerical speed, gradient, watts and rider identifiers remain attached. Check x-position, W-prime and rider ordering against original orientation.
- **32 experimental ID-renaming runs:** for 8/12/24/32-rider fields across all four synthetic envelopes and two variations, reassign identifier strings while retaining the exact same logical cyclist, command targets and real positions.
- **32 unchanged-control ID-renaming runs:** repeat precisely that renaming in the original symmetric-halving baseline to check whether the comparison is merely a harness effect.

Thus the audit completed **344 full 60-second research runs** (240 core +40 mirrors +32 experiment renames +32 baseline renames). All accepted paths stayed pairwise swept clear; finite W-prime, mechanical-energy equality, unchanged rider commands and exact midpoint JSON restart assertions passed. The 344 runs are *synthetic snapshots extended for 60 seconds*, not historical 106/168-rider complete races. Nothing was written to Supabase or the live game.

## Verified outcomes

| Invariant or observation | Result |
|---|---:|
| Core resolution-matched comparisons | **120** |
| Mirrored-road experiments with changed final x | **0 / 40** |
| A37 candidate ID-renamings with changed final x | **14 / 32** |
| Largest A37 candidate change from merely renaming IDs | **76.955201 m** |
| Original symmetric solver ID-renamings with changed final x | **0 / 32** |
| Largest original solver change under ID renaming | **0 m** |
| Full-substep conservative fallback to original solver | **11** (2s: 7, 2.5s: 2, 5s: 2) |
| Accepted swept collisions | **0** |
| Recorded unsafe ratio-candidate rejections | 2s **83,397**; 2.5s **70,060**; 5s **74,577** |
| Priority rounds with multiple *identical* earliest pair contact times | 2s **414**; 2.5s **457**; 5s **389** |

Rider IDs are used by A37 to choose the first conflicting pair in such ties. Because IDs are the **only intentional difference** in the controlled renaming experiments, the 14 divergent candidates establish an identity-based physics priority bug. The unchanged symmetric control shows none of this divergence. The counts of equal-contact ties establish a **plausible and code-visible mechanism** but not a proof that every individual divergent event was caused exclusively by that one comparator; there may also be additional subtle numerical order dependencies.

## Contact geometry and fallback characterization

The 2.5-second run recorded these **4,333 selected first-contact rounds** across the 40 synthetic merge cases (2,849 successful unilateral clearance selections +1,484 local symmetric fallbacks):

| First contacted pair's proposed lateral motion | Recorded selected rounds |
|---|---:|
| Both paths temporarily straight | **2,857** |
| Only one path actively steering | **1,253** |
| Both moving laterally in the same direction | **223** |
| Opposing lateral directions | **0** |

The predominant selected conflicts occur **even while both riders are going straight** in what are classed as merge-style overall fixtures. Therefore it would be incorrect to diagnose all late-race discrepancies solely as two cyclists simultaneously changing lanes. Nonlinear lateral motion affects some decisions, but same-lane/following resolution and who receives priority continue to matter.

At 2.5 seconds, the 4,333 selected rounds rejected **70,060** bounded candidate yield-ratios as physically unsafe when checked against opposing paths; these checks must not be bypassed. The earliest-contact pair analysis reports *selected first pairs on each iterative conflict decision*, not a distinct count of collision incidents or crashes. In other words, it includes multiple iterations within a single physical substep.

All **11** full-substep safe reversion events were reproduced across **five** matched fixture configurations:

- Baseline-5m / 24 riders / variation 1 / 5s: 1.
- Baseline-5m / 32 riders / variation 0 / 2s: 4.
- Baseline-5m / 32 riders / variation 1 / 5s: 1.
- Wide-6.5m / 32 riders / variation 0 / 2s: 3.
- Cautious-5m / 32 riders / variation 0 / 2.5s: 2.

They happened mostly around tick 4 (the 40–50 second window) when overlapping proposals persisted through the trial's 64-round research limit. The only acceptable consequence remains a safe conservative reversion to the original resolver. These are *failed voluntary resolution attempts*, not accepted rider collisions or race crashes.

## Numerical and sporting failure remains

A38 intentionally did not modify the A37 movement policy. It reproduced the known synthetic merge disagreement:

| 60-second final comparison against 2-second reference | Symmetric control | A37 rear-yield trial |
|---|---:|---:|
| 2.5s pairwise rider-order reversals | **626** | 798 |
| 2.5s maximum rider-position difference | **207.03m** | 237.66m |
| 5s pairwise rider-order reversals | **759** | 982 |
| 5s maximum rider-position difference | **209.15m** | 235.01m |

Those figures are from the 40-configuration A37 subset, **not 106/168-rider stage classifications**, and the 2s reference is not known to be more realistic than the other schedules.

## Decision and next corrective scope

**A38 diagnosis COMPLETE.** The critical new, independently controlled observation is that rider-ID renaming moves the *experimental* A37 riders by up to **76.96m** even when physical commands and initial states are unchanged; the original symmetrical solver is invariant under exactly the same renamings. **This is a clear reason to keep A37 REJECTED**, and may contribute to the larger instability seen in contested merges.

**Step A39:** isolate tied first-contact pair selection, remove arbitrary ID priority and require an ID-permutation-invariant physical tie decision. A collision-free, energy-finite, deterministic implementation is a minimum; eliminate the currently observed ID-renaming drift across all 32 comparisons, then re-run both active-merge and full 2/2.5/5-second numerical stability screens without losing following or fixed-lane gains. If a symmetric local conflict can only be resolved by attenuating a group together, that behavior must be a tested physical rule, not an artifact of the rider label.

A2 sporting approval is still **NO-GO**. Verified terrain/road-width source fidelity, credible 106/168-rider finishing gaps and rank invariance, authentic breakaway/pursuit mechanics, tactical gameplay integration and production-readiness work all remain unfinished. Milestones B and C are still NOT STARTED. Live races, historical results, production Supabase and the game clock were not touched.
