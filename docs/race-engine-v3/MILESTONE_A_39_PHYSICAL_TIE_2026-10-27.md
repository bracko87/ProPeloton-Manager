# Race Engine V3 — Milestone A, Step 39: physical simultaneous-contact group policy

**27 October 2026 — owner-authorized offline patch applied to GitHub `main`; technical PASS, ID-renaming invariant PASS, mirror and timestep numerical gates FAIL; SPORTING NO-GO.**

## Scope and authorization

The owner approved the previously prepared Step39 research-only change. It was applied directly to the `bracko87/ProPeloton-Manager` repository `main` branch, which is the repository's active write branch. The patch changes two offline research modules and adds a separate verifier and CI workflow; it does not switch the live race engine, write to Supabase, change the race clock, alter historical results or add public gameplay features.

New `conflictPolicy: 'event_time_fair'` is **opt-in** and uses the existing `resolveEventTimeYieldV3` with `tiePolicy: 'physical_group'`. The existing **default** `symmetric_halving` and original A37 `event_time_yield` behavior remain selectable and were covered by regression tests.

Under the new policy, when multiple candidate rider-pair swept contacts have first-overlap times within `1e-9` of the earliest current-substep contact, all involved riders' current proposed forward and lateral movement scales are reduced together rather than choosing one arbitrarily by rider-ID sorting. A single simultaneous pair with exactly equal starting x also receives symmetric treatment. The original collision predicate remains authoritative; proposals must pass all-pair swept checks. The existing conservative full-substep fallback remains available after the bounded conflict-resolution search is exhausted.

This is a *heuristic candidate*, not a verified time-continuous physics or fair sporting rule.

## Test evidence

[GitHub Actions Step39 validation](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40579479666) completed both test jobs successfully. The dedicated auditor ran **4 provisional geometric road scenarios × 5 field sizes (2,8,12,24,32) × 2 controlled variations × 3 substeps (2s,2.5s,5s) × 3 policies = 360 run cases** with an identical sequence of 10-second rider commands in each matched run. It additionally tested **120 mirrored-road runs** and **96 logical-rider renaming runs** at all three time grids, plus direct independent simultaneous-pair collision cases.

Technical checks: independent piecewise and swept collision clearance in every accepted movement; nonnegative finite W-prime; energy mechanical joules agreeing with rider ledger; unchanged frozen commands; deterministic JSON midpoint checkpoint recovery; `officialWrites: 0`; `sportingApproval: NOT_APPROVED`.

The separate regression job reran earlier A38/A37/A36/A35/A34/A33/A32 and finished-stage technical checks and built the React application. The result is a **technically green suite**, not a passing sporting/numerical threshold. Raw individual scenario results and failures are available in the CI artifact `a2-step39-fairness-evidence`.

## Verified outcomes after 60 synthetic seconds

| Policy / time grid | Maximum same-rider x difference vs 2s | Pairwise reversed rider orderings | Hard safe-control fallbacks |
|---|---:|---:|---:|
| Original symmetric, 2.5s | **207.03m** | **626** | 0 |
| A37 rear-yield, 2.5s | 237.66m | 798 | 2 |
| A39 fair-tie, 2.5s | 229.99m | **1,164** | 8 |
| Original symmetric, 5s | **209.15m** | **759** | 0 |
| A37 rear-yield, 5s | 235.01m | 982 | 2 |
| A39 fair-tie, 5s | 250.09m | **1,104** | 1 |

The 2s output is a **comparison reference, not a physically verified truth**. These synthetic orderings are **not actual full-stage results or official rider rankings**.

A39's new group rule was exercised **1,551 times at 2s**, **1,065 times at 2.5s** and **668 times at 5s** across the 40 respective merge scenarios; these are research conflict-loop interventions, not crashes. Attenuated rider-substep events increased in the new policy, and group admission can itself disrupt rider progress. Hard fallbacks at the 2s reference increased to **30**, compared with A37's 7 on the same scenarios — an additional scalability warning, not an accepted outcome.

## Physical symmetry and fairness result

| Fairness criterion | Observed result | Decision |
|---|---|---|
| Logical rider IDs changed but positions/commands/power unchanged | **0/96 cases** with changed final x, maximum 0m | **PASS** |
| Left-right road reflection with mirrored target lanes | **3/120 cases** with changed x; maximum **56.272143m** | **FAIL** |
| Numerical stability in merge traffic vs original symmetric | 2.5s rank inversions **626→1,164**; 5s **759→1,104** | **FAIL** |
| Continuous swept safety and energy ledger | 360 technical fixtures pass, no accepted swept overlap | **PASS** |

A38 found that renaming riders without changing their physical identities or commands moved the original A37 candidate by up to 76.96m. A39 eliminates that specific nonphysical dependence in the controlled tested matrix. However, the new rule still has reflection-sensitive outcomes in three runs and produces *worse* timestep-dependent merge rankings than the original symmetric approach. Fixing one fairness defect is **necessary but insufficient** for sporting realism.

## Next bounded work

**A39 remains rejected for racing use.** Keep `event_time_fair` and `event_time_yield` as isolated experimental policies only, with `symmetric_halving` the source of truth for the offline A34 adapter. The live multiplayer engine remains unchanged.

**A40 research focus:** reproduce the exact three mirror failures with per-substep first-contact time and geometry data; prove whether they originate from mirrored floating-point lane rounding, per-pair rear selection or synchronized group membership. Retest unbiased IDs, reflected geometry, multi-substep ordering, W-prime and collision invariants together, and reject proposals that obtain zero ID-bias merely by worsening congestion. Real stage road-width/elevation provenance, peloton drafting, attack and breakaway realism and 106/168-rider final full-stage stability remain blockers. B and C are **NOT STARTED**.

No user race outcomes, historical classifications, payments, database entities, production migrations, or game-clock state were modified.
