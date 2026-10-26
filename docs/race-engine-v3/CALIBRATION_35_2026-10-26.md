# Race Engine V3 — Batch 35: same-motion draft-energy counterfactual and live-physics sensitivity

**Date:** 2026-10-26  
**Implementation:** [a12275d2e7667cc6fac7027203e3c88f02d013ed](https://github.com/bracko87/ProPeloton-Manager/commit/a12275d2e7667cc6fac7027203e3c88f02d013ed), [48ce8fd29bc2061a544a28c2b897d9653b74bb49](https://github.com/bracko87/ProPeloton-Manager/commit/48ce8fd29bc2061a544a28c2b897d9653b74bb49)  
**Decision: ENGINEERING PASS / SPORTING NO-GO / OFFLINE ONLY.** Zero official writes, zero live race/result or Supabase mutations, no production selector or game-clock change.

## The two different experiments

**A. Mechanical-work shadow, identical recorded motion.** Run the existing offline full-shelter coupled research engine with its exact actual rider positions, actual speeds, grade, headwind, crosswind and path-integrated shelter for 180 ten-second ticks (**first 30 simulated minutes**). For each rider/tick, recalculate mechanical watts under otherwise identical motion at 0%, 50% and 100% of that integrated shelter. The W-prime debit and positions in the *real shadow replay* are not changed. The difference is a **counterfactual mechanical-work requirement in joules**, not an actual energy saving in observed professional cycling.

**B. Fully interactive sensitivity.** Explicit `experimentalShelterStrength: 0 | 0.5 | 1` changes BOTH (i) shelter allowed when solving intended watts-limited speed and (ii) path-integrated shelter used when charging achieved mechanical work and finite W-prime. It is valid only in the existing W-prime offline research mode, and is rejected alongside the separate path-draft option to prevent conflicting exposure rules. The ordinary omitted setting remains byte-for-byte baseline; an explicitly passed `1` must reproduce it exactly.

For each frozen race (Dordrecht 106, Guangxi 168), run both energy-only and finite three-tick passing modes, original and grid-B synthetic starts, with all three shelter strengths: **24 full candidate race runs** plus **8 unchanged baseline checks**. The original-grid 0% and 50% cases also must match independently resumed serialized checkpoints exactly, even across active passing reservations. Full rider rank lists and mechanical/energy outcomes are retained.

## First 30 minutes: extra work with 0% shelter, holding speed fixed

Figures sum across **all riders for 30 simulated minutes** and express extra demanded mechanical work relative to the exact observed 100%-shelter path; *not* an estimated reduction in official race duration.

| Fixture and mode | Original grid | Grid B |
|---|---:|---:|
| Dordrecht 106 — W-prime energy only | +6.244 MJ | +6.056 MJ |
| Dordrecht 106 — energy + finite passing | +6.401 MJ | +6.579 MJ |
| Guangxi 168 — W-prime energy only | +13.890 MJ | +13.265 MJ |
| Guangxi 168 — energy + finite passing | +14.189 MJ | +13.005 MJ |

A 50%-shelter same-motion counterfactual costs approximately half as much additional work, as expected from the provisional linear CdA reduction. Actual kinetic motion remains identical in experiment A, so these values isolate the *work function* from the consequences of changing speed.

## Full-stage outcomes: inversions from the original grid to grid B

Pair inversion means two riders trade **relative finish order** when the initial synthetic grid seed changes. Lower is less sensitive across these two grids, but is not itself proof of realism.

| Race and mode | 0% shelter | 50% shelter | 100% shelter (existing) |
|---|---:|---:|---:|
| Dordrecht, energy-only | 32.45% | **55.13%** | 30.93% |
| Dordrecht, finite passing | 30.78% | **56.51%** | 36.19% |
| Guangxi, energy-only | 32.37% | **49.79%** | 34.10% |
| Guangxi, finite passing | 33.48% | **45.86%** | 33.84% |

**Very clear NO-GO for blanket shelter reduction.** The 50% candidate is the most grid-sensitive of the three in *all four* paired configurations. A 0%-shelter model can superficially improve some rank metrics, but **cycling without aerodynamic shelter is physically unrealistic**. None of these experiments validates a universal CdA/drafting coefficient.

### Blocking consequences in the full dynamic model

The following is *candidate minus existing 100%-shelter default* **blocked rider-ticks**. Positive = more congestion. All scenarios preserve provisional rider attributes, tactical orders and course.

| Race/mode | 0% shelter: original / B | 50% shelter: original / B |
|---|---:|---:|
| Dordrecht energy | −11,044 / −12,236 | +36,769 / +26,775 |
| Dordrecht finite passing | −11,373 / −10,067 | +31,755 / +42,431 |
| Guangxi energy | −26,889 / −20,725 | +26,640 / +72,498 |
| Guangxi finite passing | −13,317 / −22,273 | +35,293 / **+79,375** |

The 50% setting's severe congestion illustrates nonmonotonic interactions: a physically intermediate aero coefficient does **not** imply intermediate pack stability or gap evolution. All modified configurations can reshuffle a large majority of finishing ranks relative to the default within each grid. Short-term W-prime and positional trajectories co-evolve; the full-race results are **not** a pure aerodynamic-work counterfactual.

## Source, energy and checkpoint safety

- The optional factor is checked at initialize/advance time; invalid factor or missing W-prime mode is rejected, and conflicting `experimentalPathDraftWork` is rejected. No official-mode plumbing consumes this input.
- `draftCounterfactualWattsV3` preserves the existing, quadrature-rounded `wattsWithPathExposure` **exactly** at factor 1, eliminating numerical drift in the baseline. For factors 0 and .5, it recomputes watts with `CdA = 0.36 × (1 − factor × integratedShelter)` at actual achieved speed and same gradient/weather.
- W-prime and movement mechanical work debit both use the same new factor. The collision-sensitive spatial movement solver is otherwise unchanged.
- The source tracing callback adds `integratedShelterFraction`, while continuing to leave movement state unchanged. Unit tests require exact observed/unobserved rider state equality every tick and explicit-100%-shelter equality to omitted-default state.
- Original-grid factor 0 and .5 both pass exact uninterrupted versus JSON-serialized/restarted complete-race equality in energy and finite passing modes.
- Every result is stamped `mode: OFFLINE_RESEARCH_ONLY`, `sportingApproval: NOT_APPROVED`, and `officialWrites: 0`. Any non-finite finish or missing rider fails the job.
- [Batch 35 four-job full-roster matrix, strict TypeScript checks, per-tick tests, checkpoint recovery, production app build — SUCCESS](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40324470582).
- [V3 legacy isolation](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40324470579): run on the same implementation commit; inspect final job conclusion and individual failed-step count before claiming verified regression clearance.
- Artifacts retained in Actions for 30 days: `v3-batch35-dordrecht-2000-10-15-energy`, `v3-batch35-dordrecht-2000-10-15-finite_pass`, `v3-batch35-guangxi-2000-10-19-energy`, `v3-batch35-guangxi-2000-10-19-finite_pass`. Complete JSON contains all 24 candidate final-rider classifications, within-grid and cross-seed inversion metrics, fixed-motion per-tick exposure summary, W-prime and blocked rider-ticks.

## Sporting conclusion and next step

1. Drafting creates a **large modeled physical work advantage** at identical speeds, even in the first 30 minutes. Thus earlier first-tick positional differences can plausibly affect subsequent reserve state and movement before a binary wheel-block event differs.
2. This is **not** proof drafting is the predominant source of full-field reordering: suppressing physical shelter also changes rider speeds and wheel availability. Controlled first-phase lane occupancy, single-seed selection and provisional CdA remain major uncertainties.
3. **Do not adopt half-drafting or zero drafting** as a sporting fix. None passes stability across both grids and authentic physics simultaneously.
4. **Batch 36:** measure a factorial separation of **aerodynamic work under frozen achieved trajectories** from **speed-choice sensitivity under exactly matched energy states**, then independently examine lane-reservation ordering with fixed rider effort. Evaluate multiple seeds and headwind/climb regimes with pairwise finish ranks, group structure, measured real-world physics and historical source-route fidelity.

**SPORTING NO-GO.** Official V3 activation and game clocks are unchanged. These calculations are synthetic offline research only.
