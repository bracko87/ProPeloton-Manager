# Race Engine V3 — Step A54: energy and velocity of collision-safe shadow interventions

**28 October 2026 — offline shadow energy/next-substep verification PASS; provisional speed-change consistency FAIL; sporting NO-GO.**

## Scope and precise limits

In A53, **70/75** isolated component substitutions and **53/57** affected-component union substitutions were collision-free for *one frozen physical substep*. Five local and four union substitutions were demonstrably unsafe and rejected. A53 explicitly did **not** prove that an accepted hybrid path can be assigned coherent terminal speed or W-prime energy.

A54 explores the next necessary physical layer **without changing the active solver or adding another experimental conflict-policy mode**. The two baseline strategies (A44 rear priority and rejected A50 contact-time/occupancy) still generate identical source trajectories to prior tests. Any hybrid is constructed in a read-only shadow transition, never committed to a game clock, active rider state, race results or Supabase.

### Implemented research files

- `scripts/v3/a2SubstepPhysicalResearchV3.mjs`: the existing **opt-in diagnostic trace only** now emits each proposal's frozen `energyBefore`, `terminalSpeedMps` and `steeringWatts`. Actual acceleration, collision selection, accepted movement, W-prime debiting and replay logic are unchanged.
- `scripts/v3/a2HybridEnergyNextAuditV3.mjs`: independently validates the A53 geometry gate, reconstructs A34-equivalent achieved movement, substep terminal speed and W-prime ledger, then proposes and accepts **one consecutive substep** with the original A44 rear-priority swept-safe resolver. It checks the next A44 source trace is exactly reconstructible, all selected/unselected energy states, subsequent piecewise swept collision clearance, and deterministic JSON serialization/replay. It separately flags proposed terminal acceleration/braking limits.
- `scripts/v3/verify-a2-step54-shadow-energy-v3.mjs`: repeats the A53 cases, compares the original A44 energy state with all changed hybrid states, checks geometry-rejected selections remain rejected, audits all 70 eligible local and 53 eligible union alternatives, and retains every case outcome in the GitHub Actions JSON artifact.
- `.github/workflows/v3-a2-step54-shadow-energy.yml`: dedicated test plus separate A53–A39 and complete-stage regressions and production React build.

[Step54 GitHub Actions evidence](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40675322595)

## Validation counts

**162** existing 60-second offline technical simulations (40 configurations each at 0.5s and 2.5s for both policies, and one targeted 2-second pair), **81** matched comparisons, **75** local component trials and **57** component-union trials. All 57 original first accepted-path differences were reproduced. No official writes.

| True physical quantum | Geometrically safe local cases | Energy reconstructed | Consecutive substep swept-safe and replayed | Candidate cases with speed-limit violation | Newly violating cases vs matched A44 riders |
|---|---:|---:|---:|---:|---:|
| 0.5 seconds | 31 | **31** | **31** | **31** | **27** |
| 2 seconds (one targeted fixture) | 1 | **1** | **1** | **1** | **1** |
| 2.5 seconds | 38 | **38** | **38** | **36** | **32** |
| **Total** | **70** | **70** | **70** | **68** | **60** |

All original **five** geometry-rejected local and **four** geometry-rejected union substitutions stayed rejected without proceeding to energy or next-step acceptance. All **53** geometrically safe union alternatives also passed one-step energy recomputation and a consecutive substep shadow check. No trial exhausted W-prime or generated an independently accepted swept collision. All 70 local shadow checkpoints round-tripped through JSON and reproduced the second physical step deterministically.

These are two-substep **shadow** trajectories; **full 10-second hybrid advancement was not implemented or certified** in A54. In particular, "next-step replay" means one next physical substep, not the entire longer simulation or a player race.

## Main blocker: terminal speed is not physically continuous

The experimental A34/A44 collision solver shortens both forward and lateral distance when riders need to avoid contact. For an attenuated movement, the research adapter sets terminal speed to the **achieved mean speed across that interval**, rather than a velocity that respects acceleration or braking throughout the substep. This can create an instantaneous apparent deceleration far above the provisional physical rates used to generate unconstrained proposals (+0.45m/s² acceleration and -0.85m/s² braking).

A54 recalculates the exact terminal speed used by that rule for every safe hybrid. In **68/70** local cases, at least one changed rider's resulting terminal speed exceeds one of those provisional acceleration/braking limits. Crucially, a direct comparison with the *same rider in the same A44 source step* shows **60/70** cases introduce at least one violation that the A44 comparison path did not have. The remainder includes cases where the baseline was also already violating its provisional speed-change constraints; neither side is physically approved.

At the 0.5-second grid, the worst selected-rider terminal-speed difference corresponds to approximately **14.249998m/s²** speed-change magnitude, vastly exceeding both provisional caps. At 2.5 seconds the largest such rate is **3.694531m/s²**, and the maximum absolute end-speed difference between the hybrid and A44 alternatives reaches **8.374999m/s**.

Only **two of 70** local substitutions pass the *changed-rider* speed-change check; that is a narrow negative screen, **not** validation of full acceleration, mechanical dynamics, racing or official classifications.

### Energy and future movement observations

The exact provisional A34 research energy accounting accepted all 70 local candidate movements. Their maximum W-prime differences relative to same-source A44 riders in one substep are **0.010607J (0.5s)**, **0J (targeted 2s)** and **0.056989J (2.5s)**. These small differences do **not** imply physical correctness: the energy model is provisional and the collision-avoidance action is allowed to change achieved velocity abruptly.

When advancing a second physical substep with the unchanged rider commands, both the A44 reference replay and the changed hybrid replay were collision-free and deterministic. However, resulting positions may differ significantly from A44: maximum x deviations of **5.56875m** after the next 0.5s substep, **14.099999m** at 2s and **39.218747m** at 2.5s. The next step consumes the new terminal speed, so the original discontinuity has further effects even if all collision pairs clear.

There is no sporting truth inferred from the shared reference: any approval still requires actual source geometry, terrain, drafting and complete stages.

## Decision and next work

**A54 diagnostic capture, exact energy ledger reconstruction, independent next-substep collision safety and deterministic replay PASS. Physical continuity, full-tick integration, time-grid convergence and sporting authenticity FAIL / NOT APPROVED.** The A44 and A50 policy outcomes and live selected solver remain unchanged.

**A55:** tackle velocity-continuous collision avoidance rather than changing which rider wins a local contact. Distinguish mathematically feasible braking under physical acceleration limits from emergency safe-stop exceptions, and define an explicit research-only method that cannot silently substitute a terminal speed discontinuity. Re-test the 60 newly violating cases, source contact dependencies and ID/lateral symmetry, plus completed 10s and later race segments, before attempting a full-peloton application.

**A2 NO-GO. Milestones B and C NOT STARTED. No official race result, payout, Supabase or game-clock change.**
