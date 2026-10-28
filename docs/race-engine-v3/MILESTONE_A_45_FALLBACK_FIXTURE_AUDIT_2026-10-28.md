# Race Engine V3 — Milestone A Step 45: bounded rear-yield fallback and per-fixture fairness audit

**28 October 2026 — observational research completed, 440/440 technical runs passed; A2 sporting decision remains NO-GO.**

## Question

Step A44 produced the first experimental rear-priority collision solver to improve **aggregate** maximum rider position, gap and total rank-inversion errors across 1/2/2.5/5s physical steps compared with the A43 trapezoid reference. But A44 still needed **148** conservative full-substep fallbacks at the 0.5-second reference and the aggregate score could hide individual rider and scenario setbacks.

This step checks precisely where those fallbacks come from, whether instrumentation changes the solver's output, how much per-fixture stability is lost, and whether full-scale peloton readiness can legitimately be claimed. **It does not change the existing rear-priority or default solver's collision decisions.**

## Observational source change

In `scripts/v3/a2CollisionPriorityResearchV3.mjs`, new `diagnostics:true` is strictly optional. For a priority search that exhausts its 64 rounds and restarts using the original all-pair symmetric swept safety gate, it records the originally conflicting pairs, unresolved pairs, longitudinal/lateral start/proposal coordinates, current attenuation ratios, the minimum scale and how many scales have reached effectively zero.

In `scripts/v3/a2SubstepPhysicalResearchV3.mjs`, this information appears in `lastTickConflictTrace` **only when `diagnosticTrace:true` is requested**. No priority classification, collision predicate, accepted motion, W-prime debit or checkpoint schema is modified by this trace.

The separate A45 test checks 40 exact matched cases with diagnostic mode both **on and off** and requires **identical final riders and solver metrics** for each. The identical-outcome gate passed all 40.

## Verified test scope

[Actual Step45 GitHub Actions](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40653835598) and preserved JSON artifact `a2-step45-research-audit`:

- **40** synthetic source fixtures: four provisional road geometries × five fields of 2,8,12,24,32 riders × two controlled variations.
- Each fixture runs the A43 symmetric trapezoid reference and A44 experimental rear-priority physics for **60 synthetic seconds** at **0.5, 1, 2, 2.5 and 5-second true physical steps**: **400 runs**.
- Each fixture also reruns the A44 0.5s physics without instrumentation to verify **40 additional identical-outcome checks**: **440 total technical runs**.
- Each accepted trajectory independently passes piecewise swept collision clearance, nonnegative finite W-prime, mechanical-energy ledger equality, unchanged frozen commands, and exact JSON halfway checkpoint replay.

The same `0.5-second` result is a comparative numerical reference, **not verified physical truth**. 60-second partial-pack positional rankings are **not actual full-stage classifications**.

## Exactly what happened in the 148 fallbacks

The audit **reproduced the A44 0.5s fallback total exactly: 148**. Their distribution:

| Synthetic road geometry | 0.5s fallback episodes |
|---|---:|
| Compact 4m | 0 |
| Baseline 5m | **76** |
| Wide 6.5m | **72** |
| Cautious 5m | 0 |
| **Total** | **148** |

In both affected roads, the fallback appears only for fields with at least 8 riders, during the final simulation interval from **50.5 to 59.5 seconds**. Each baseline field size 8,12,24,32 contributes **19** fallback episodes across its two variations, and each wide-field size contributes **18**.

All **148/148** fallbacks have a yield scale reduced to approximately zero, but still retain at least one unresolved swept-contact pair at the end of the bounded 64-round unilateral search. All **148/148** retain at least one pair that was already in the initial conflict set. At the last attempted iteration there is **at most one unresolved pair**.

This is **direct evidence of a persistent-contact failure of the unilateral rear-motion scaling heuristic**, not evidence of an accepted bicycle collision. The algorithm conservatively abandons the unsuccessful unilateral proposal and recomputes a safe all-pair synchronized fallback from the original proposals. It does **not yet prove** whether the continuing conflict is due to front-rider overtaking, moving-lane interactions, contact-boundary rounding or some combination; the accompanying recorded pair coordinates support that next investigation.

Fallbacks at other step sizes also reproduced A44 exactly:

| Physical step | Full safe-control fallbacks |
|---|---:|
| 0.5s | **148** |
| 1s | 30 |
| 2s | 10 |
| 2.5s | 12 |
| 5s | 0 |

This timestep dependence itself is a concern, even when no accepted path is unsafe.

## Per-fixture fairness gates: aggregate successes mask regressions

Unlike the A44 aggregate study, A45 compares **each matched fixture**, measuring maximum same-rider x difference, maximum leader-gap difference and total pair-order inversions **relative to that policy's own 0.5-second run**. A fixture fails the combined check if rear priority worsens **any one** of those three metrics against the A43 trapezoid policy.

| Physical step | Individual fixtures checked | Worse position | Worse gap | Worse rider-pair ordering | Fail ≥1 combined gate |
|---|---:|---:|---:|---:|---:|
| 1s | 40 | 0 | 2 | 0 | **2** |
| 2s | 40 | 0 | 2 | 4 | **6** |
| 2.5s | 40 | 1 | 2 | 5 | **6** |
| 5s | 40 | 0 | 0 | 7 | **7** |
| **Total** | **160** | **1** | **6** | **16** | **21** |

The metric-column regressions overlap, so their totals should not be added to derive independent failures.

Notable counterexamples:
- **Cautious 5m / 32 riders / variation 0 / 2.5s:** rear priority produces **166.01449m** maximum x divergence versus baseline **135.650874m** (a **30.363616m regression**), and **65** reversed relative rider orders versus **53** (12 more).
- **Cautious 5m / 32 riders / variation 0 / 5s:** total inversions **58 vs 44** (14 more), even though max x error improves **140.429m→95.239m**.
- **Baseline 5m / 12 riders / variation 1 / 5s:** **16 vs 9** pair inversions, despite substantially smaller maximum x drift.

Therefore, **139/160 individual grid comparisons did not worsen any of the three measured metrics**, but the **remaining 21** invalidate any blanket claim that A44 universally improves pack dynamics. Being better on average is not the same as being stable in each racing situation.

## Full-scale limit explicitly verified

The present `a2SubstepPhysicalResearchV3.mjs` adapter accepts **2–32 riders** only. A45 explicitly attempted controlled initialization with **106 and 168 rider states** and confirmed that **both are rejected** with `Invalid A34 roster count`.

The study **did not** run a 106- or 168-rider full peloton, and it must not be used to imply full-stage throughput, draft realism or realistic results for these fields. Source-authentic elevation and road widths are also outstanding.

## Decision and next engineering step

**A45 diagnostic, independent technical safety and replay gates PASS. Overall A2 sporting gate remains NO-GO.** Nothing from A45 was switched on in live multiplayer races. A44 rear priority remains the most promising **experimental** aggregate-stability baseline; neither the default engine nor any historical results were altered.

**A46 should now target the persistent-pair mechanism** directly, rather than adding more unconstrained halving rounds. For example, investigate a physically bounded follower clearance rule that accounts for the moving leader and competing lane-entry motion, preserves no-surprise rider speed and energy, and returns to symmetric fallback if clearance cannot be guaranteed. Reject a proposed correction unless it demonstrably reduces persistent-contact fallbacks **and** passes swept geometry, rider-ID/reflection invariance, and per-fixture position/gap/rank gates at every tested physical time step. Before any production decision, validate source-calibrated full stages and authentic full fields.

**A2 sporting NO-GO; B/C NOT STARTED. No Supabase data, official racing results, player currencies, or game-clock changes.**
